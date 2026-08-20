"""Versioned browser artifact assembly and atomic persistence."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from .embeddings import EmbeddingBatch
from .galaxy_layout import GalaxyLayoutResult
from .hierarchy import HierarchyResult, UNASSIGNED_HUB_ID
from .markdown import ParsedNote
from .models import KnowledgeSpaceArtifact, validate_artifact
from .relationships import RelationshipResult


DEFAULT_ARTIFACT_PATH = Path("frontend/public/data/knowledge-space.json")


def build_artifact(
    notes: list[ParsedNote] | tuple[ParsedNote, ...],
    embeddings: EmbeddingBatch,
    relationships: RelationshipResult,
    positions: np.ndarray,
    *,
    hierarchy: HierarchyResult,
    layouts: GalaxyLayoutResult,
    vault_hash: str,
    pipeline_version: str,
    umap_metadata: dict[str, Any],
    hierarchy_min_similarity: float = 0.60,
) -> KnowledgeSpaceArtifact:
    """Assemble a schema-ready artifact without embedding high-dimensional data."""
    coordinates = np.asarray(positions, dtype=np.float32)
    if coordinates.shape != (len(notes), 3):
        raise ValueError(f"positions must have shape {(len(notes), 3)}, got {coordinates.shape}")
    if tuple(note.note_id for note in notes) != embeddings.note_ids:
        raise ValueError("notes and embeddings must use the same ordered note IDs")

    embedding_metadata = {
        key: embeddings.metadata[key]
        for key in ("model", "dimension", "metric", "normalized", "revision", "device", "runtime_device")
        if key in embeddings.metadata and embeddings.metadata[key] is not None
    }
    hierarchy_by_id = hierarchy.by_id()
    if set(hierarchy_by_id) != set(embeddings.note_ids):
        raise ValueError("hierarchy and embeddings must use the same note IDs")
    if set(layouts.galaxy) != set(layouts.compact):
        raise ValueError("galaxy and compact layouts must use the same node IDs")
    expected_layout_ids = set(embeddings.note_ids)
    if any(record.parent_id == UNASSIGNED_HUB_ID for record in hierarchy.records):
        expected_layout_ids.add(UNASSIGNED_HUB_ID)
    if set(layouts.galaxy) != expected_layout_ids:
        raise ValueError("layouts must contain exactly the hierarchy node IDs")

    artifact: dict[str, Any] = {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pipeline": {"version": pipeline_version},
        "embedding": embedding_metadata,
        "umap": umap_metadata,
        "layout_generation": layouts.metadata,
        "relationships": {
            "max_neighbors": relationships.distribution["max_neighbors"],
            "min_similarity": relationships.distribution["threshold"],
            "hierarchy_min_similarity": hierarchy_min_similarity,
        },
        "source": {"vault_hash": vault_hash, "note_count": len(notes)},
        "nodes": [
            {
                "id": note.note_id,
                "title": note.title,
                "summary": note.summary,
                "domain": note.domain,
                "layouts": {
                    "semantic": _position(coordinates[row]),
                    "galaxy": _position(layouts.galaxy[note.note_id]),
                    "compact": _position(layouts.compact[note.note_id]),
                },
                "hierarchy": {
                    "role": hierarchy_by_id[note.note_id].role,
                    "parent_id": hierarchy_by_id[note.note_id].parent_id,
                    "depth": hierarchy_by_id[note.note_id].depth,
                    "assignment": hierarchy_by_id[note.note_id].assignment,
                    "topic_root_id": hierarchy_by_id[note.note_id].topic_root_id,
                },
                "explicit_link_count": len(note.wikilinks),
            }
            for row, note in enumerate(notes)
        ],
        "virtual_nodes": _virtual_nodes(layouts),
        "links": relationships.artifact_links(),
    }
    return validate_artifact(artifact)


def _virtual_nodes(layouts: GalaxyLayoutResult) -> list[dict[str, Any]]:
    if UNASSIGNED_HUB_ID not in layouts.galaxy:
        return []
    return [
        {
            "id": UNASSIGNED_HUB_ID,
            "title": "未归类",
            "layouts": {
                "semantic": _position(layouts.galaxy[UNASSIGNED_HUB_ID]),
                "galaxy": _position(layouts.galaxy[UNASSIGNED_HUB_ID]),
                "compact": _position(layouts.compact[UNASSIGNED_HUB_ID]),
            },
            "hierarchy": {
                "role": "hub",
                "parent_id": None,
                "depth": 0,
                "assignment": "unassigned",
                "topic_root_id": UNASSIGNED_HUB_ID,
            },
        }
    ]


def _position(values: Any) -> dict[str, float]:
    return {"x": float(values[0]), "y": float(values[1]), "z": float(values[2])}


def write_artifact_atomic(
    artifact: KnowledgeSpaceArtifact,
    destination: Path = DEFAULT_ARTIFACT_PATH,
    *,
    schema_path: Path | None = None,
) -> None:
    """Validate, then atomically replace the previous valid artifact."""
    validate_artifact(artifact, schema_path)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix=f"{destination.stem}-",
            suffix=".tmp",
            dir=destination.parent,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(artifact, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
