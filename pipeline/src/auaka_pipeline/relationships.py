"""Canonical Wikilink and thresholded semantic relationship generation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

from .embeddings import EmbeddingBatch, EmbeddingError
from .markdown import ParsedNote


class RelationshipError(ValueError):
    """Raised when notes and embeddings cannot form a valid relation graph."""


@dataclass(frozen=True, slots=True)
class RelationshipConfig:
    """Controls bounded semantic-neighbor generation.

    ``min_similarity=None`` is an explicit calibration mode: Top-K candidates
    are emitted without filtering so Task 13 can inspect the real distribution.
    Production artifact generation should provide a calibrated threshold.
    """

    max_neighbors: int = 5
    min_similarity: float | None = None

    def __post_init__(self) -> None:
        if self.max_neighbors <= 0:
            raise ValueError("max_neighbors must be positive")
        if self.min_similarity is not None and not -1.0 <= self.min_similarity <= 1.0:
            raise ValueError("min_similarity must be between -1 and 1")


@dataclass(frozen=True, slots=True)
class RelationRecord:
    """One canonical edge, potentially carrying both relation types."""

    source: str
    target: str
    types: tuple[str, ...]
    similarity: float | None = None
    is_unresolved: bool = False
    unresolved_target: str | None = None

    def to_artifact_link(self) -> dict[str, Any]:
        """Convert to the shared JSON artifact link shape."""

        link: dict[str, Any] = {
            "source": self.source,
            "target": self.target,
            "types": list(self.types),
            "is_unresolved": self.is_unresolved,
        }
        if self.similarity is not None:
            link["similarity"] = self.similarity
        if self.unresolved_target is not None:
            link["unresolved_target"] = self.unresolved_target
        return link


@dataclass(frozen=True, slots=True)
class RelationshipResult:
    links: tuple[RelationRecord, ...]
    distribution: dict[str, Any]

    def artifact_links(self) -> list[dict[str, Any]]:
        return [link.to_artifact_link() for link in self.links]


def build_relationships(
    notes: Sequence[ParsedNote],
    embeddings: EmbeddingBatch,
    config: RelationshipConfig,
) -> RelationshipResult:
    """Build explicit and semantic links with deterministic canonicalization."""

    note_ids = tuple(note.note_id for note in notes)
    if len(note_ids) != len(set(note_ids)):
        raise RelationshipError("notes contain duplicate note ids")
    if set(note_ids) != set(embeddings.note_ids) or len(note_ids) != len(embeddings.note_ids):
        raise RelationshipError("notes and embedding index do not contain the same ids")

    records: dict[tuple[str, str, bool], RelationRecord] = {}
    known_ids = set(note_ids)

    for note in notes:
        for reference in note.wikilinks:
            target_id = reference.resolved_target_id
            if target_id in known_ids:
                key = _resolved_key(note.note_id, target_id)
                records[key] = _with_type(records.get(key), "wikilink") or RelationRecord(
                    source=key[0], target=key[1], types=("wikilink",)
                )
            elif target_id not in known_ids:
                unresolved_target = reference.raw_target
                key = (note.note_id, unresolved_target, True)
                if key not in records:
                    records[key] = RelationRecord(
                        source=note.note_id,
                        target=unresolved_target,
                        types=("wikilink",),
                        is_unresolved=True,
                        unresolved_target=unresolved_target,
                    )
            # Resolved self-links stay in the data layer because explicit
            # Wikilinks are preserved; a later renderer may suppress their loop.

    similarity_matrix = _cosine_matrix(embeddings.vectors)
    distribution = _similarity_distribution(similarity_matrix, config)
    id_to_row = {note_id: row for row, note_id in enumerate(embeddings.note_ids)}

    for source_id in note_ids:
        source_row = id_to_row[source_id]
        candidates = [
            (float(similarity_matrix[source_row, target_row]), target_id)
            for target_id, target_row in id_to_row.items()
            if target_id != source_id
        ]
        candidates.sort(key=lambda candidate: (-candidate[0], candidate[1]))
        for similarity, target_id in candidates[: config.max_neighbors]:
            if config.min_similarity is not None and similarity < config.min_similarity:
                continue
            key = _resolved_key(source_id, target_id)
            records[key] = _with_semantic(records.get(key), similarity) or RelationRecord(
                source=key[0],
                target=key[1],
                types=("semantic",),
                similarity=similarity,
            )

    return RelationshipResult(
        links=tuple(
            sorted(
                records.values(),
                key=lambda record: (record.is_unresolved, record.source, record.target),
            )
        ),
        distribution=distribution,
    )


def _resolved_key(source: str, target: str) -> tuple[str, str, bool]:
    first, second = sorted((source, target))
    return first, second, False


def _with_type(record: RelationRecord | None, relation_type: str) -> RelationRecord | None:
    if record is None:
        return None
    if relation_type in record.types:
        return record
    return RelationRecord(
        source=record.source,
        target=record.target,
        types=record.types + (relation_type,),
        similarity=record.similarity,
        is_unresolved=record.is_unresolved,
        unresolved_target=record.unresolved_target,
    )


def _with_semantic(
    record: RelationRecord | None,
    similarity: float,
) -> RelationRecord | None:
    if record is None:
        return None
    types = record.types if "semantic" in record.types else record.types + ("semantic",)
    return RelationRecord(
        source=record.source,
        target=record.target,
        types=types,
        similarity=max(record.similarity or similarity, similarity),
        is_unresolved=record.is_unresolved,
        unresolved_target=record.unresolved_target,
    )


def _cosine_matrix(vectors: np.ndarray) -> np.ndarray:
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim != 2:
        raise RelationshipError("embedding vectors must be a two-dimensional array")
    if not np.isfinite(matrix).all():
        raise RelationshipError("embedding vectors contain NaN or infinite values")
    if matrix.shape[0] == 0:
        return np.empty((0, 0), dtype=np.float32)

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms <= np.finfo(np.float32).eps):
        raise EmbeddingError("semantic links require non-zero embedding vectors")
    normalized = matrix / norms
    # Float32 dot products can produce values such as 1.0000002 for a
    # mathematically identical vector; the artifact contract is [-1, 1].
    return np.clip(normalized @ normalized.T, -1.0, 1.0)


def _similarity_distribution(
    matrix: np.ndarray,
    config: RelationshipConfig,
) -> dict[str, Any]:
    if matrix.shape[0] < 2:
        values = np.asarray([], dtype=np.float32)
    else:
        values = matrix[np.triu_indices(matrix.shape[0], k=1)]

    distribution: dict[str, Any] = {
        "count": int(values.size),
        "threshold": config.min_similarity,
        "max_neighbors": config.max_neighbors,
    }
    if values.size:
        distribution.update(
            {
                "min": float(values.min()),
                "max": float(values.max()),
                "mean": float(values.mean()),
                "p25": float(np.quantile(values, 0.25)),
                "p50": float(np.quantile(values, 0.50)),
                "p75": float(np.quantile(values, 0.75)),
            }
        )
    else:
        distribution.update(
            {"min": None, "max": None, "mean": None, "p25": None, "p50": None, "p75": None}
        )
    return distribution
