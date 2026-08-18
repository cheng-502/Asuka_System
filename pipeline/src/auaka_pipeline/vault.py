"""Read-only Obsidian Vault scanner."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, replace
from pathlib import Path, PurePosixPath

from .markdown import ParsedNote, WikilinkReference, parse_markdown


@dataclass(frozen=True, slots=True)
class VaultScanConfig:
    excluded_directories: frozenset[str] = frozenset(
        {
            ".obsidian",
            "assets",
            "attachments",
            "attachment",
            "img",
            "images",
            "templates",
            "template",
        }
    )
    excluded_files: frozenset[str] = frozenset(
        {"task_plan.md", "findings.md", "progress.md"}
    )
    summary_max_chars: int = 280


@dataclass(frozen=True, slots=True)
class ExcludedNote:
    relative_path: str
    reason: str


@dataclass(frozen=True, slots=True)
class UnresolvedWikilink:
    source_id: str
    raw_target: str


@dataclass(frozen=True, slots=True)
class ScanError:
    relative_path: str
    message: str


@dataclass(frozen=True, slots=True)
class VaultScanReport:
    root: Path
    notes: tuple[ParsedNote, ...]
    excluded: tuple[ExcludedNote, ...]
    unresolved_links: tuple[UnresolvedWikilink, ...]
    errors: tuple[ScanError, ...]

    @property
    def included_count(self) -> int:
        return len(self.notes)


def indexing_report(report: VaultScanReport) -> dict[str, object]:
    """Convert a scan result into a JSON-safe diagnostic report."""

    return {
        "vault": str(report.root),
        "included_count": report.included_count,
        "excluded_count": len(report.excluded),
        "unresolved_link_count": len(report.unresolved_links),
        "error_count": len(report.errors),
        "notes": [
            {
                "id": note.note_id,
                "title": note.title,
                "domain": note.domain,
                "wikilink_count": len(note.wikilinks),
            }
            for note in report.notes
        ],
        "excluded": [asdict(item) for item in report.excluded],
        "unresolved_links": [asdict(item) for item in report.unresolved_links],
        "errors": [asdict(item) for item in report.errors],
    }


def scan_vault(root: Path, config: VaultScanConfig | None = None) -> VaultScanReport:
    """Scan Markdown files without writing to the Vault or changing file metadata."""

    scan_config = config or VaultScanConfig()
    vault_root = Path(root).resolve()
    if not vault_root.is_dir():
        raise NotADirectoryError(f"Vault root does not exist: {vault_root}")

    excluded: list[ExcludedNote] = []
    errors: list[ScanError] = []
    notes: list[ParsedNote] = []

    paths = sorted(
        (
            path
            for path in vault_root.rglob("*")
            if path.is_file() and path.suffix.casefold() == ".md"
        ),
        key=lambda path: path.relative_to(vault_root).as_posix().casefold(),
    )

    for path in paths:
        relative_path = path.relative_to(vault_root).as_posix()
        exclusion_reason = _exclusion_reason(relative_path, scan_config)
        if exclusion_reason:
            excluded.append(ExcludedNote(relative_path, exclusion_reason))
            continue

        try:
            content = path.read_bytes()
        except OSError as error:
            errors.append(ScanError(relative_path, str(error)))
            continue

        text = content.decode("utf-8-sig", errors="replace")
        if not text.strip():
            excluded.append(ExcludedNote(relative_path, "empty_file"))
            continue

        notes.append(
            parse_markdown(
                text,
                note_id=relative_path,
                content_hash=hashlib.sha256(content).hexdigest(),
                summary_max_chars=scan_config.summary_max_chars,
            )
        )

    resolved_notes, unresolved_links = _resolve_links(notes)
    return VaultScanReport(
        root=vault_root,
        notes=tuple(resolved_notes),
        excluded=tuple(excluded),
        unresolved_links=tuple(unresolved_links),
        errors=tuple(errors),
    )


def _exclusion_reason(relative_path: str, config: VaultScanConfig) -> str | None:
    path = PurePosixPath(relative_path)
    excluded_directories = {item.casefold() for item in config.excluded_directories}
    if any(part.casefold() in excluded_directories for part in path.parts[:-1]):
        return "excluded_directory"
    if path.name.casefold() in {item.casefold() for item in config.excluded_files}:
        return "excluded_file"
    return None


def _resolve_links(
    notes: list[ParsedNote],
) -> tuple[list[ParsedNote], list[UnresolvedWikilink]]:
    exact_ids = {note.note_id.casefold(): note.note_id for note in notes}
    stem_ids: dict[str, list[str]] = {}
    for note in notes:
        path = PurePosixPath(note.note_id)
        stem_ids.setdefault(path.stem.casefold(), []).append(note.note_id)

    unresolved: list[UnresolvedWikilink] = []
    resolved_notes: list[ParsedNote] = []
    for note in notes:
        resolved_links: list[WikilinkReference] = []
        for link in note.wikilinks:
            target_id = _resolve_target(link.raw_target, exact_ids, stem_ids)
            resolved_link = replace(link, resolved_target_id=target_id)
            resolved_links.append(resolved_link)
            if target_id is None:
                unresolved.append(UnresolvedWikilink(note.note_id, link.raw_target))
        resolved_notes.append(replace(note, wikilinks=tuple(resolved_links)))
    return resolved_notes, unresolved


def _resolve_target(
    raw_target: str,
    exact_ids: dict[str, str],
    stem_ids: dict[str, list[str]],
) -> str | None:
    target = raw_target.replace("\\", "/").strip().lstrip("/")
    while target.startswith("./"):
        target = target[2:]
    if not target:
        return None

    target_with_extension = target if target.casefold().endswith(".md") else f"{target}.md"
    direct_match = exact_ids.get(target_with_extension.casefold())
    if direct_match:
        return direct_match

    candidates = stem_ids.get(PurePosixPath(target).stem.casefold(), [])
    return candidates[0] if len(candidates) == 1 else None
