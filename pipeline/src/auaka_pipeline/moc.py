"""Review-first folder based Hub/MOC proposal generation."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import PurePosixPath
import tempfile
from typing import Literal, Sequence

from .markdown import ParsedNote


ProposalAction = Literal[
    "create", "update-generated-region", "move", "stale", "conflict"
]
ApprovalState = Literal["pending", "approved", "rejected"]

DEFAULT_TOP_LEVEL_MOC_FOLDERS: tuple[str, ...] = (
    "计算机",
    "项目",
    "AI学习图谱",
    "编程",
    "AI-Knowledge-Base",
    "modern_genai_bilibili-main",
    "摄影与器材",
    "阅读",
    "python",
    "VUE3笔记",
)


@dataclass(frozen=True, slots=True)
class ProposalChange:
    action: ProposalAction
    path: str
    approval: ApprovalState
    reason: str
    source_folder: str | None = None
    parent_path: str | None = None


@dataclass(frozen=True, slots=True)
class FolderHub:
    folder: str
    moc_path: str
    parent_moc_path: str | None
    note_ids: tuple[str, ...]
    note_groups: tuple[tuple[str, tuple[str, ...]], ...]


@dataclass(frozen=True, slots=True)
class FolderHubIndex:
    hubs: tuple[FolderHub, ...]
    root_note_ids: tuple[str, ...]
    excluded_note_ids: tuple[str, ...]
    excluded_top_level_folders: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MocProposal:
    index: FolderHubIndex
    drafts: dict[str, str]
    changes: tuple[ProposalChange, ...]
    vault_hash: str | None = None


def build_folder_hub_index(
    notes: Sequence[ParsedNote],
    *,
    parent_overrides: dict[str, str] | None = None,
    top_level_folders: Sequence[str] = DEFAULT_TOP_LEVEL_MOC_FOLDERS,
) -> FolderHubIndex:
    """Build deterministic top-level Hub groups without embedding calls."""

    note_ids = [note.note_id.replace("\\", "/") for note in notes]
    if len(note_ids) != len(set(note_ids)):
        raise ValueError("duplicate note ids")

    normalized_overrides = {
        _normalize_folder(child): _normalize_folder(parent)
        for child, parent in (parent_overrides or {}).items()
    }
    _validate_parent_overrides(normalized_overrides)

    allowed = {_normalize_folder(folder) for folder in top_level_folders}
    if len(allowed) != len(tuple(top_level_folders)):
        raise ValueError("top-level MOC folders must be unique")
    folder_notes: dict[str, list[str]] = {folder: [] for folder in allowed}
    root_notes: list[str] = []
    excluded_notes: list[str] = []
    excluded_folders: set[str] = set()
    for note_id in note_ids:
        path = PurePosixPath(note_id)
        if len(path.parts) <= 1:
            root_notes.append(note_id)
            continue
        top_level = path.parts[0]
        if top_level not in allowed:
            excluded_notes.append(note_id)
            excluded_folders.add(top_level)
            continue
        folder_notes[top_level].append(note_id)

    hubs: list[FolderHub] = []
    for folder in top_level_folders:
        folder = _normalize_folder(folder)
        notes_in_hub = tuple(sorted(folder_notes[folder], key=lambda value: (value.casefold(), value)))
        if not notes_in_hub:
            continue
        groups: dict[str, list[str]] = {}
        for note_id in notes_in_hub:
            relative_folder = PurePosixPath(note_id).parent.relative_to(PurePosixPath(folder))
            group = relative_folder.as_posix() if str(relative_folder) != "." else ""
            groups.setdefault(group, []).append(note_id)
        note_groups = tuple(
            (group, tuple(groups[group]))
            for group in sorted(groups, key=lambda value: (value.casefold(), value))
        )
        moc_path = _moc_path(folder)
        hubs.append(
            FolderHub(
                folder=folder,
                moc_path=moc_path,
                parent_moc_path=None,
                note_ids=notes_in_hub,
                note_groups=note_groups,
            )
        )

    return FolderHubIndex(
        hubs=tuple(hubs),
        root_note_ids=tuple(sorted(root_notes, key=lambda value: (value.casefold(), value))),
        excluded_note_ids=tuple(sorted(excluded_notes, key=lambda value: (value.casefold(), value))),
        excluded_top_level_folders=tuple(sorted(excluded_folders, key=lambda value: (value.casefold(), value))),
    )


def proposal_to_dict(change: ProposalChange) -> dict[str, object]:
    """Return a JSON-safe representation of one proposal change."""

    return asdict(change)


def moc_proposal_to_dict(proposal: MocProposal) -> dict[str, object]:
    """Return a JSON-safe review proposal without embedding note content."""

    return {
        "version": 1,
        "vault_hash": proposal.vault_hash,
        "hubs": [
            {
                "folder": hub.folder,
                "moc_path": hub.moc_path,
                "parent_moc_path": hub.parent_moc_path,
                "note_ids": list(hub.note_ids),
                "note_groups": [
                    {"folder": group, "note_ids": list(note_ids)}
                    for group, note_ids in hub.note_groups
                ],
            }
            for hub in proposal.index.hubs
        ],
        "root_note_ids": list(proposal.index.root_note_ids),
        "excluded_note_ids": list(proposal.index.excluded_note_ids),
        "excluded_top_level_folders": list(proposal.index.excluded_top_level_folders),
        "changes": [proposal_to_dict(change) for change in proposal.changes],
    }


def render_moc_draft(hub: FolderHub, index: FolderHubIndex) -> str:
    """Render one deterministic MOC draft without touching the Vault."""

    parent_value = ""
    if hub.parent_moc_path:
        parent_value = _wikilink_target(hub.parent_moc_path)
    frontmatter = [
        "---",
        "knowledge_role: hub",
        f"knowledge_parent: {json.dumps(parent_value, ensure_ascii=False)}",
        f"hub_source_folder: {json.dumps(hub.folder, ensure_ascii=False)}",
        'hub_scope: "top-level"',
        "hub_generated: true",
        'hub_generator_version: "1.1"',
        "---",
        "",
        "# 导语",
        "",
    ]
    lines = [*frontmatter, GENERATED_START]
    for group, note_ids in hub.note_groups:
        heading = "根目录笔记" if not group else group
        lines.extend([f"## {heading}", ""])
        lines.extend(f"- [[{_wikilink_target(note_id)}]]" for note_id in note_ids)
        lines.append("")
    lines.append(GENERATED_END)
    return "\n".join(lines) + "\n"


def build_moc_proposal(
    index: FolderHubIndex,
    *,
    existing_mocs: dict[str, str] | None = None,
    vault_hash: str | None = None,
) -> MocProposal:
    """Create drafts and review changes; never writes existing files."""

    existing = existing_mocs or {}
    drafts = {hub.moc_path: render_moc_draft(hub, index) for hub in index.hubs}
    changes: list[ProposalChange] = []
    for hub in index.hubs:
        current = existing.get(hub.moc_path)
        draft = drafts[hub.moc_path]
        if current is None:
            changes.append(
                ProposalChange(
                    action="create",
                    path=hub.moc_path,
                    approval="pending",
                    reason="folder has Markdown notes and no MOC",
                    source_folder=hub.folder,
                    parent_path=hub.parent_moc_path,
                )
            )
            continue
        if GENERATED_START not in current or GENERATED_END not in current:
            action: ProposalAction = "conflict"
            reason = "existing MOC has no AUAKA generated region"
        elif _generated_region(current) != _generated_region(draft):
            action = "update-generated-region"
            reason = "generated relations changed"
        else:
            continue
        changes.append(
            ProposalChange(
                action=action,
                path=hub.moc_path,
                approval="pending",
                reason=reason,
                source_folder=hub.folder,
                parent_path=hub.parent_moc_path,
            )
        )
    return MocProposal(index=index, drafts=drafts, changes=tuple(changes), vault_hash=vault_hash)


def apply_moc_proposal(
    vault_root: str | os.PathLike[str],
    proposal: MocProposal,
    *,
    drafts: dict[str, str],
    approved: bool,
    current_vault_hash: str | None = None,
) -> tuple[str, ...]:
    """Apply an explicitly approved proposal with marker-only updates."""

    if not approved:
        raise PermissionError("explicit approval is required before writing the Vault")
    if proposal.vault_hash is not None and current_vault_hash != proposal.vault_hash:
        raise ValueError("Vault hash mismatch; regenerate the proposal")

    root = os.path.abspath(os.fspath(vault_root))
    prepared: list[tuple[str, str]] = []
    for change in proposal.changes:
        if change.action == "conflict":
            raise ValueError(f"proposal contains conflict: {change.path}")
        if change.action not in {"create", "update-generated-region"}:
            continue
        relative = PurePosixPath(change.path)
        if any(part in {"", ".", ".."} for part in relative.parts):
            raise ValueError(f"unsafe proposal path: {change.path}")
        target = os.path.abspath(os.path.join(root, *relative.parts))
        if os.path.commonpath((root, target)) != root:
            raise ValueError(f"proposal path escapes Vault: {change.path}")
        draft = drafts.get(change.path)
        if draft is None:
            raise ValueError(f"missing draft for proposal path: {change.path}")
        if change.action == "create":
            if os.path.exists(target):
                raise FileExistsError(f"MOC already exists: {change.path}")
            content = draft
        else:
            if not os.path.isfile(target):
                raise FileNotFoundError(f"MOC does not exist: {change.path}")
            with open(target, encoding="utf-8", newline="") as stream:
                current = stream.read()
            if GENERATED_START not in current or GENERATED_END not in current:
                raise ValueError(f"MOC has no generated region: {change.path}")
            content = _replace_generated_region(current, _generated_region(draft))
        prepared.append((target, content))

    written: list[str] = []
    for target, content in prepared:
        parent = os.path.dirname(target)
        os.makedirs(parent, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".auaka-", suffix=".tmp", dir=parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(content)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        written.append(os.path.relpath(target, root).replace(os.sep, "/"))
    return tuple(written)


def render_review_report(proposal: MocProposal) -> str:
    """Render a human-readable review report for a proposal."""

    lines = [
        "# Hub/MOC 审核报告",
        "",
        f"候选 Hub 数量：{len(proposal.index.hubs)}",
        f"变更数量：{len(proposal.changes)}",
        f"Vault Hash：{proposal.vault_hash or '未提供'}",
        "",
        "## 变更清单",
        "",
    ]
    if proposal.changes:
        for change in proposal.changes:
            lines.append(f"- [{change.approval}] `{change.action}` `{change.path}`：{change.reason}")
    else:
        lines.append("- 没有需要审核的 MOC 变更。")
    lines.extend(["", "## 根目录未归类笔记", ""])
    if proposal.index.root_note_ids:
        lines.extend(f"- [[{_wikilink_target(note_id)}]]" for note_id in proposal.index.root_note_ids)
    else:
        lines.append("- 无")
    lines.extend(["", "## 未纳入顶层 MOC 的第一层文件夹", ""])
    if proposal.index.excluded_top_level_folders:
        lines.extend(f"- `{folder}`" for folder in proposal.index.excluded_top_level_folders)
    else:
        lines.append("- 无")
    lines.extend(["", "## 审核说明", "", "批准前不会修改 Vault。", ""])
    return "\n".join(lines)


def _normalize_folder(value: str) -> str:
    normalized = value.replace("\\", "/").strip().strip("/")
    if not normalized or normalized == ".":
        return ""
    path = PurePosixPath(normalized)
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"unsafe folder path: {value}")
    return path.as_posix()


GENERATED_START = "<!-- AUAKA:BEGIN GENERATED RELATIONS -->"
GENERATED_END = "<!-- AUAKA:END GENERATED RELATIONS -->"


def _wikilink_target(path: str) -> str:
    return path[:-3] if path.casefold().endswith(".md") else path


def _generated_region(text: str) -> str:
    start = text.index(GENERATED_START)
    end = text.index(GENERATED_END, start) + len(GENERATED_END)
    return text[start:end]


def _replace_generated_region(current: str, replacement: str) -> str:
    start = current.index(GENERATED_START)
    end = current.index(GENERATED_END, start) + len(GENERATED_END)
    return current[:start] + replacement + current[end:]


def _moc_path(folder: str) -> str:
    path = PurePosixPath(folder)
    return (path / f"MOC - {path.name}.md").as_posix()


def _nearest_candidate_parent(folder: str, candidates: set[str]) -> str | None:
    current = PurePosixPath(folder).parent
    while str(current) not in {"", "."}:
        candidate = current.as_posix()
        if candidate in candidates:
            return candidate
        current = current.parent
    return None


def _validate_parent_overrides(overrides: dict[str, str]) -> None:
    for child, parent in overrides.items():
        if not child or not parent:
            raise ValueError("parent override cannot target the root folder")
    for start in sorted(overrides):
        visited: set[str] = set()
        current: str | None = start
        while current in overrides:
            if current in visited:
                raise ValueError("parent cycle")
            visited.add(current)
            current = overrides[current]
