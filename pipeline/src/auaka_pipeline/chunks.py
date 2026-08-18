"""Deterministic, Markdown-aware chunk records for local retrieval."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Iterable

from .markdown import ParsedNote


CHUNK_HEADING_PATTERN = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True, slots=True)
class ChunkingConfig:
    """Controls the approximate token budget used by the first retriever."""

    max_tokens: int = 450
    overlap_tokens: int = 50

    def __post_init__(self) -> None:
        if self.max_tokens <= 0:
            raise ValueError("max_tokens must be positive")
        if self.overlap_tokens < 0 or self.overlap_tokens >= self.max_tokens:
            raise ValueError("overlap_tokens must be non-negative and smaller than max_tokens")

    def metadata(self) -> dict[str, int]:
        return {"max_tokens": self.max_tokens, "overlap_tokens": self.overlap_tokens}


@dataclass(frozen=True, slots=True)
class KnowledgeChunk:
    chunk_id: str
    note_id: str
    title: str
    heading_path: tuple[str, ...]
    content: str
    start_offset: int
    end_offset: int
    content_hash: str
    ordinal: int

    def embedding_text(self) -> str:
        context = " > ".join((self.title, *self.heading_path))
        return f"{context}\n\n{self.content}".strip()

    def to_dict(self) -> dict[str, object]:
        return {
            "chunk_id": self.chunk_id,
            "note_id": self.note_id,
            "title": self.title,
            "heading_path": list(self.heading_path),
            "content": self.content,
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "content_hash": self.content_hash,
            "ordinal": self.ordinal,
        }


@dataclass(frozen=True, slots=True)
class _TextUnit:
    start: int
    end: int
    text: str


def approximate_token_count(text: str) -> int:
    """Count CJK characters individually and Latin words/punctuation approximately."""

    count = 0
    latin_buffer = False
    for character in text:
        if _is_cjk(character):
            if latin_buffer:
                count += 1
                latin_buffer = False
            count += 1
        elif character.isalnum() or character == "_":
            latin_buffer = True
        else:
            if latin_buffer:
                count += 1
                latin_buffer = False
            if not character.isspace():
                count += 1
    if latin_buffer:
        count += 1
    return count


def chunk_note(note: ParsedNote, config: ChunkingConfig | None = None) -> tuple[KnowledgeChunk, ...]:
    """Split one parsed note while retaining source offsets and heading context."""

    chunking = config or ChunkingConfig()
    source = note.source_text
    if not source:
        return ()

    chunks: list[KnowledgeChunk] = []
    ordinal = 0
    for heading_path, section_start, section_end in _sections(source):
        units = _section_units(
            source, section_start, section_end, max_tokens=chunking.max_tokens
        )
        if not units:
            continue
        for start, end in _pack_units(units, chunking):
            content = source[start:end]
            if not content.strip():
                continue
            chunk_id = _chunk_id(note.note_id, heading_path, ordinal)
            chunks.append(
                KnowledgeChunk(
                    chunk_id=chunk_id,
                    note_id=note.note_id,
                    title=note.title,
                    heading_path=heading_path,
                    content=content,
                    start_offset=start,
                    end_offset=end,
                    content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
                    ordinal=ordinal,
                )
            )
            ordinal += 1
    return tuple(chunks)


def chunk_notes(notes: Iterable[ParsedNote], config: ChunkingConfig | None = None) -> tuple[KnowledgeChunk, ...]:
    chunks: list[KnowledgeChunk] = []
    for note in notes:
        chunks.extend(chunk_note(note, config))
    return tuple(chunks)


def _sections(source: str) -> tuple[tuple[tuple[str, ...], int, int], ...]:
    body_start = _body_start_offset(source)
    headings: list[tuple[int, int, int, str]] = []
    for match in re.finditer(r"^.*(?:\n|$)", source[body_start:], flags=re.MULTILINE):
        line = match.group(0).rstrip("\n")
        heading = CHUNK_HEADING_PATTERN.match(line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).strip()
            headings.append((body_start + match.start(), body_start + match.end(), level, title))

    if not headings:
        return (((), body_start, len(source)),)

    sections: list[tuple[tuple[str, ...], int, int]] = []
    if headings[0][0] > body_start:
        sections.append(((), body_start, headings[0][0]))
    stack: list[tuple[int, str]] = []
    for index, (start, line_end, level, title) in enumerate(headings):
        while stack and stack[-1][0] >= level:
            stack.pop()
        stack.append((level, title.rstrip("#").strip()))
        end = headings[index + 1][0] if index + 1 < len(headings) else len(source)
        sections.append((tuple(item[1] for item in stack), start, end))
    return tuple(sections)


def _section_units(
    source: str, start: int, end: int, *, max_tokens: int
) -> tuple[_TextUnit, ...]:
    units: list[_TextUnit] = []
    cursor = start
    unit_start: int | None = None
    for line in source[start:end].splitlines(keepends=True):
        line_start = cursor
        cursor += len(line)
        if line.strip():
            if unit_start is None:
                unit_start = line_start
            continue
        if unit_start is not None:
            units.extend(_split_long_unit(source, unit_start, line_start, max_tokens))
            unit_start = None
    if unit_start is not None:
        units.extend(_split_long_unit(source, unit_start, end, max_tokens))
    return tuple(units)


def _split_long_unit(
    source: str, start: int, end: int, max_tokens: int
) -> tuple[_TextUnit, ...]:
    text = source[start:end]
    sentence_matches = list(re.finditer(r"\S.*?(?:[.!?。！？](?=\s|$)|$)", text, flags=re.DOTALL))
    if len(sentence_matches) <= 1 and approximate_token_count(text) > max_tokens:
        return _hard_split(source, start, end, max_tokens)
    if len(sentence_matches) <= 1:
        return (_TextUnit(start, end, text),)
    units: list[_TextUnit] = []
    for match in sentence_matches:
        sentence_start = start + match.start()
        sentence_end = start + match.end()
        if approximate_token_count(match.group(0)) > max_tokens:
            units.extend(_hard_split(source, sentence_start, sentence_end, max_tokens))
        else:
            units.append(_TextUnit(sentence_start, sentence_end, match.group(0)))
    return tuple(units)


def _hard_split(source: str, start: int, end: int, max_tokens: int) -> tuple[_TextUnit, ...]:
    units: list[_TextUnit] = []
    piece_start = start
    for position in range(start + 1, end + 1):
        if approximate_token_count(source[piece_start:position]) <= max_tokens:
            continue
        if position - 1 > piece_start:
            units.append(
                _TextUnit(piece_start, position - 1, source[piece_start : position - 1])
            )
            piece_start = position - 1
        else:
            units.append(_TextUnit(piece_start, position, source[piece_start:position]))
            piece_start = position
    if piece_start < end:
        units.append(_TextUnit(piece_start, end, source[piece_start:end]))
    return tuple(units)


def _pack_units(units: tuple[_TextUnit, ...], config: ChunkingConfig) -> tuple[tuple[int, int], ...]:
    chunks: list[tuple[int, int]] = []
    current: list[_TextUnit] = []
    for unit in units:
        if current and approximate_token_count(_joined_text(current, unit)) > config.max_tokens:
            chunks.append((current[0].start, current[-1].end))
            current = _overlap_units(current, config.overlap_tokens)
            while current and approximate_token_count(_joined_text(current, unit)) > config.max_tokens:
                current.pop(0)
        current.append(unit)
        if approximate_token_count(unit.text) > config.max_tokens:
            chunks.append((current[0].start, current[-1].end))
            current = []
    if current:
        chunks.append((current[0].start, current[-1].end))
    return tuple(chunks)


def _overlap_units(units: list[_TextUnit], overlap_tokens: int) -> list[_TextUnit]:
    if overlap_tokens == 0:
        return []
    selected: list[_TextUnit] = []
    total = 0
    for unit in reversed(units):
        tokens = approximate_token_count(unit.text)
        if selected and total + tokens > overlap_tokens:
            break
        selected.insert(0, unit)
        total += tokens
    return selected


def _joined_text(current: list[_TextUnit], next_unit: _TextUnit) -> str:
    if not current:
        return next_unit.text
    return " ".join(unit.text for unit in (*current, next_unit))


def _chunk_id(note_id: str, heading_path: tuple[str, ...], ordinal: int) -> str:
    heading = "/".join(heading_path) or "_root_"
    return f"{note_id}::{heading}::{ordinal:04d}"


def _body_start_offset(source: str) -> int:
    if not source.startswith("---"):
        return 0
    first_line_end = source.find("\n")
    if first_line_end < 0:
        return 0
    for match in re.finditer(r"^\s*(?:---|\.\.\.)\s*$", source[first_line_end + 1 :], flags=re.MULTILINE):
        return first_line_end + 1 + match.end()
    return 0


def _is_cjk(character: str) -> bool:
    codepoint = ord(character)
    return (
        0x3040 <= codepoint <= 0x30FF
        or 0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xAC00 <= codepoint <= 0xD7AF
    )
