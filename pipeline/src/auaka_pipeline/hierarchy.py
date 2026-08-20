"""Deterministic multi-level topic hierarchy resolution."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Literal, Sequence

import numpy as np

from .embeddings import EmbeddingBatch
from .markdown import ParsedNote
from .relationships import RelationshipResult


Assignment = Literal["explicit", "wikilink", "folder", "semantic", "unassigned"]
Role = Literal["hub", "note"]
UNASSIGNED_HUB_ID = "virtual:unassigned"


@dataclass(frozen=True, slots=True)
class HierarchyConfig:
    min_semantic_similarity: float = 0.60

    def __post_init__(self) -> None:
        if not -1.0 <= self.min_semantic_similarity <= 1.0:
            raise ValueError("min_semantic_similarity must be between -1 and 1")


@dataclass(frozen=True, slots=True)
class HierarchyRecord:
    note_id: str
    role: Role
    parent_id: str | None
    depth: int
    assignment: Assignment
    topic_root_id: str


@dataclass(frozen=True, slots=True)
class HierarchyWarning:
    note_id: str
    code: str
    target: str | None = None


@dataclass(frozen=True, slots=True)
class HierarchyResult:
    records: tuple[HierarchyRecord, ...]
    warnings: tuple[HierarchyWarning, ...]

    def by_id(self) -> dict[str, HierarchyRecord]:
        return {record.note_id: record for record in self.records}


def resolve_hierarchy(
    notes: Sequence[ParsedNote],
    relationships: RelationshipResult,
    config: HierarchyConfig | None = None,
    *,
    embeddings: EmbeddingBatch | None = None,
) -> HierarchyResult:
    """Resolve explicit and fallback parentage without mutating source notes."""

    settings = config or HierarchyConfig()
    ordered_notes = tuple(sorted(notes, key=lambda note: note.note_id))
    note_by_id = {note.note_id: note for note in ordered_notes}
    if len(note_by_id) != len(ordered_notes):
        raise ValueError("notes contain duplicate note ids")
    canonical_ids = {note.note_id.casefold() for note in ordered_notes}
    if len(canonical_ids) != len(ordered_notes):
        raise ValueError("notes contain case-insensitive note id collisions")

    warnings: list[HierarchyWarning] = []
    hubs = {note.note_id for note in ordered_notes if note.knowledge_role == "hub"}
    exact_ids, stem_ids = _reference_indexes(ordered_notes)

    for note in ordered_notes:
        if note.knowledge_role_raw is not None and note.knowledge_role is None:
            warnings.append(HierarchyWarning(note.note_id, "invalid_role", note.knowledge_role_raw))
        if note.knowledge_parent_raw is not None and note.knowledge_parent is None:
            warnings.append(HierarchyWarning(note.note_id, "invalid_parent", note.knowledge_parent_raw))

    requested_hub_parents: dict[str, str | None] = {}
    for hub_id in sorted(hubs):
        note = note_by_id[hub_id]
        parent_id = _resolve_declared_parent(note, exact_ids, stem_ids)
        if note.knowledge_parent is not None and parent_id not in hubs:
            warnings.append(
                HierarchyWarning(hub_id, "unresolved_parent", note.knowledge_parent.raw_target)
            )
            parent_id = None
        requested_hub_parents[hub_id] = parent_id

    cycle_ids = _find_cycle_ids(requested_hub_parents)
    for note_id in sorted(cycle_ids):
        warnings.append(
            HierarchyWarning(note_id, "parent_cycle", requested_hub_parents[note_id])
        )
        requested_hub_parents[note_id] = None

    hub_depths, hub_roots = _hub_depths_and_roots(requested_hub_parents)
    records: list[HierarchyRecord] = [
        HierarchyRecord(
            note_id=hub_id,
            role="hub",
            parent_id=requested_hub_parents[hub_id],
            depth=hub_depths[hub_id],
            assignment="explicit",
            topic_root_id=hub_roots[hub_id],
        )
        for hub_id in sorted(hubs)
    ]

    similarities = (
        _embedding_similarity_lookup(embeddings, set(note_by_id), hubs)
        if embeddings is not None
        else _semantic_similarity_lookup(relationships)
    )
    hubs_by_folder = _hubs_by_folder(hubs)
    for note in ordered_notes:
        if note.note_id in hubs:
            continue
        parent_id, assignment = _ordinary_parent(
            note,
            hubs,
            exact_ids,
            stem_ids,
            similarities,
            hubs_by_folder,
            settings,
            warnings,
        )
        if parent_id == UNASSIGNED_HUB_ID:
            depth = 1
            topic_root_id = UNASSIGNED_HUB_ID
        else:
            depth = hub_depths[parent_id] + 1
            topic_root_id = hub_roots[parent_id]
        records.append(
            HierarchyRecord(
                note_id=note.note_id,
                role="note",
                parent_id=parent_id,
                depth=depth,
                assignment=assignment,
                topic_root_id=topic_root_id,
            )
        )

    return HierarchyResult(
        records=tuple(sorted(records, key=lambda record: record.note_id)),
        warnings=tuple(sorted(warnings, key=lambda warning: (warning.note_id, warning.code))),
    )


def _ordinary_parent(
    note: ParsedNote,
    hubs: set[str],
    exact_ids: dict[str, str],
    stem_ids: dict[str, tuple[str, ...]],
    similarities: dict[frozenset[str], float],
    hubs_by_folder: dict[PurePosixPath, tuple[str, ...]],
    config: HierarchyConfig,
    warnings: list[HierarchyWarning],
) -> tuple[str, Assignment]:
    explicit_parent = _resolve_declared_parent(note, exact_ids, stem_ids)
    if note.knowledge_parent is not None:
        if explicit_parent in hubs:
            return explicit_parent, "explicit"
        warnings.append(
            HierarchyWarning(note.note_id, "unresolved_parent", note.knowledge_parent.raw_target)
        )

    linked_hubs = {
        reference.resolved_target_id
        for reference in note.wikilinks
        if reference.resolved_target_id in hubs
        and _same_folder_subtree(note.note_id, reference.resolved_target_id)
    }
    if linked_hubs:
        return _strongest_candidate(note.note_id, linked_hubs, similarities), "wikilink"

    folder_parent = _nearest_folder_hub(note.note_id, hubs_by_folder)
    if folder_parent is not None:
        return folder_parent, "folder"

    semantic_candidates = [
        (similarity, hub_id)
        for hub_id in hubs
        if (similarity := similarities.get(frozenset((note.note_id, hub_id)))) is not None
        and similarity >= config.min_semantic_similarity
    ]
    if semantic_candidates:
        semantic_candidates.sort(key=lambda candidate: (-candidate[0], candidate[1]))
        return semantic_candidates[0][1], "semantic"

    return UNASSIGNED_HUB_ID, "unassigned"


def _reference_indexes(
    notes: Sequence[ParsedNote],
) -> tuple[dict[str, str], dict[str, tuple[str, ...]]]:
    exact_ids = {note.note_id.casefold(): note.note_id for note in notes}
    stems: dict[str, list[str]] = {}
    for note in notes:
        stems.setdefault(PurePosixPath(note.note_id).stem.casefold(), []).append(note.note_id)
    return exact_ids, {key: tuple(sorted(values)) for key, values in stems.items()}


def _resolve_declared_parent(
    note: ParsedNote,
    exact_ids: dict[str, str],
    stem_ids: dict[str, tuple[str, ...]],
) -> str | None:
    if note.knowledge_parent is None:
        return None
    target = note.knowledge_parent.raw_target.replace("\\", "/").strip().lstrip("/")
    while target.startswith("./"):
        target = target[2:]
    if not target:
        return None
    target_with_extension = target if target.casefold().endswith(".md") else f"{target}.md"
    direct = exact_ids.get(target_with_extension.casefold())
    if direct is not None:
        return direct
    candidates = stem_ids.get(PurePosixPath(target).stem.casefold(), ())
    return candidates[0] if len(candidates) == 1 else None


def _find_cycle_ids(parents: dict[str, str | None]) -> set[str]:
    complete: set[str] = set()
    cycle_ids: set[str] = set()
    for start in sorted(parents):
        if start in complete:
            continue
        path: list[str] = []
        path_index: dict[str, int] = {}
        cursor: str | None = start
        while cursor is not None and cursor not in complete:
            if cursor in path_index:
                cycle_ids.update(path[path_index[cursor] :])
                break
            path_index[cursor] = len(path)
            path.append(cursor)
            cursor = parents.get(cursor)
        complete.update(path)
    return cycle_ids


def _hub_depths_and_roots(
    parents: dict[str, str | None],
) -> tuple[dict[str, int], dict[str, str]]:
    depths: dict[str, int] = {}
    roots: dict[str, str] = {}
    for hub_id in sorted(parents):
        path: list[str] = []
        cursor = hub_id
        while cursor not in depths:
            path.append(cursor)
            parent_id = parents[cursor]
            if parent_id is None:
                depths[cursor] = 0
                roots[cursor] = cursor
                path.pop()
                break
            cursor = parent_id
        while path:
            child_id = path.pop()
            parent_id = parents[child_id]
            if parent_id is None:
                depths[child_id] = 0
                roots[child_id] = child_id
            else:
                depths[child_id] = depths[parent_id] + 1
                roots[child_id] = roots[parent_id]
    return depths, roots


def _semantic_similarity_lookup(
    relationships: RelationshipResult,
) -> dict[frozenset[str], float]:
    result: dict[frozenset[str], float] = {}
    for relation in relationships.links:
        if relation.is_unresolved or "semantic" not in relation.types or relation.similarity is None:
            continue
        key = frozenset((relation.source, relation.target))
        result[key] = max(result.get(key, -1.0), relation.similarity)
    return result


def _embedding_similarity_lookup(
    embeddings: EmbeddingBatch,
    note_ids: set[str],
    hubs: set[str],
) -> dict[frozenset[str], float]:
    if set(embeddings.note_ids) != note_ids or len(embeddings.note_ids) != len(note_ids):
        raise ValueError("notes and hierarchy embeddings must use the same note IDs")
    vectors = np.asarray(embeddings.vectors, dtype=np.float64)
    if vectors.ndim != 2 or vectors.shape[0] != len(embeddings.note_ids):
        raise ValueError("hierarchy embeddings must be a two-dimensional aligned matrix")
    if not np.isfinite(vectors).all():
        raise ValueError("hierarchy embeddings must be finite")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms <= np.finfo(np.float64).eps):
        raise ValueError("hierarchy embeddings must be non-zero")
    normalized = vectors / norms
    rows = {note_id: index for index, note_id in enumerate(embeddings.note_ids)}
    result: dict[frozenset[str], float] = {}
    for note_id in sorted(note_ids - hubs):
        for hub_id in sorted(hubs):
            similarity = float(np.clip(np.dot(normalized[rows[note_id]], normalized[rows[hub_id]]), -1.0, 1.0))
            result[frozenset((note_id, hub_id))] = similarity
    return result


def _strongest_candidate(
    note_id: str,
    candidates: set[str],
    similarities: dict[frozenset[str], float],
) -> str:
    return min(
        candidates,
        key=lambda candidate: (
            -similarities.get(frozenset((note_id, candidate)), -1.0),
            candidate,
        ),
    )


def _same_folder_subtree(first_id: str, second_id: str) -> bool:
    first_folder = PurePosixPath(first_id).parent.parts
    second_folder = PurePosixPath(second_id).parent.parts
    first_root = first_folder[0] if first_folder else ""
    second_root = second_folder[0] if second_folder else ""
    return first_root == second_root


def _hubs_by_folder(hubs: set[str]) -> dict[PurePosixPath, tuple[str, ...]]:
    grouped: dict[PurePosixPath, list[str]] = {}
    for hub_id in hubs:
        grouped.setdefault(PurePosixPath(hub_id).parent, []).append(hub_id)
    return {folder: tuple(sorted(ids)) for folder, ids in grouped.items()}


def _nearest_folder_hub(
    note_id: str,
    hubs_by_folder: dict[PurePosixPath, tuple[str, ...]],
) -> str | None:
    folder = PurePosixPath(note_id).parent
    while True:
        candidates = hubs_by_folder.get(folder)
        if candidates:
            return candidates[0]
        if folder == PurePosixPath("."):
            return None
        folder = folder.parent
