"""Deterministic Markdown metadata and Wikilink extraction."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath


WIKILINK_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")
HEADING_PATTERN = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
FRONTMATTER_FIELD_PATTERN = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*?)\s*$")


@dataclass(frozen=True, slots=True)
class WikilinkReference:
    raw_target: str
    alias: str | None = None
    heading: str | None = None
    resolved_target_id: str | None = None

    @property
    def display_text(self) -> str:
        return self.alias or PurePosixPath(self.raw_target).stem


@dataclass(frozen=True, slots=True)
class ParsedNote:
    note_id: str
    title: str
    summary: str
    domain: str
    wikilinks: tuple[WikilinkReference, ...]
    content_hash: str
    source_text: str = ""


def parse_markdown(
    text: str,
    note_id: str,
    content_hash: str = "",
    summary_max_chars: int = 280,
) -> ParsedNote:
    """Parse stable note metadata without executing Markdown or frontmatter code."""

    normalized_text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    frontmatter, body = _split_frontmatter(normalized_text)
    title = frontmatter.get("title") or _heading_title(body) or PurePosixPath(note_id).stem
    links = tuple(_extract_wikilinks(_without_fenced_code(body)))
    summary = _extract_summary(_without_fenced_code(body), summary_max_chars)
    path = PurePosixPath(note_id)
    domain = path.parts[0] if len(path.parts) > 1 else "root"

    return ParsedNote(
        note_id=note_id,
        title=_clean_inline_markdown(title),
        summary=summary,
        domain=domain,
        wikilinks=links,
        content_hash=content_hash,
        source_text=normalized_text,
    )


def _split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text

    closing_index = next(
        (index for index, line in enumerate(lines[1:], start=1) if line.strip() in {"---", "..."}),
        None,
    )
    if closing_index is None:
        return {}, text

    frontmatter: dict[str, str] = {}
    for line in lines[1:closing_index]:
        match = FRONTMATTER_FIELD_PATTERN.match(line)
        if match:
            frontmatter[match.group(1).casefold()] = _strip_scalar(match.group(2))
    return frontmatter, "\n".join(lines[closing_index + 1 :])


def _strip_scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def _heading_title(body: str) -> str | None:
    for line in body.splitlines():
        match = HEADING_PATTERN.match(line)
        if match:
            return _clean_inline_markdown(match.group(1))
    return None


def _extract_summary(body: str, max_chars: int) -> str:
    paragraph: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped:
            if paragraph:
                break
            continue
        if HEADING_PATTERN.match(stripped):
            if paragraph:
                break
            continue
        paragraph.append(_clean_inline_markdown(stripped))

    summary = " ".join(part for part in paragraph if part).strip()
    return summary[:max_chars].rstrip()


def _extract_wikilinks(body: str) -> list[WikilinkReference]:
    links: list[WikilinkReference] = []
    for match in WIKILINK_PATTERN.finditer(body):
        target_and_heading, alias = (match.group(1).split("|", 1) + [None])[:2]
        target_and_heading = target_and_heading.strip()
        target, separator, heading = target_and_heading.partition("#")
        links.append(
            WikilinkReference(
                raw_target=target.strip(),
                alias=alias.strip() if alias else None,
                heading=heading.strip() if separator and heading.strip() else None,
            )
        )
    return links


def _without_fenced_code(body: str) -> str:
    lines: list[str] = []
    in_fence = False
    for line in body.splitlines():
        if line.strip().startswith("```") or line.strip().startswith("~~~"):
            in_fence = not in_fence
            continue
        if not in_fence:
            lines.append(line)
    return "\n".join(lines)


def _clean_inline_markdown(value: str) -> str:
    value = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]", lambda match: match.group(2) or PurePosixPath(match.group(1)).stem, value)
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"[*_`~]", "", value)
    value = re.sub(r"^\s*[-*+]\s+", "", value)
    return re.sub(r"\s+", " ", value).strip()
