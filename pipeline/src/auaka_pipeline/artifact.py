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
    vault_hash: str,
    pipeline_version: str,
    umap_metadata: dict[str, Any],
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
    artifact: dict[str, Any] = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pipeline": {"version": pipeline_version},
        "embedding": embedding_metadata,
        "umap": umap_metadata,
        "source": {"vault_hash": vault_hash, "note_count": len(notes)},
        "nodes": [
            {
                "id": note.note_id,
                "title": note.title,
                "summary": note.summary,
                "domain": note.domain,
                "position": {"x": float(coordinates[row, 0]), "y": float(coordinates[row, 1]), "z": float(coordinates[row, 2])},
                "explicit_link_count": len(note.wikilinks),
            }
            for row, note in enumerate(notes)
        ],
        "links": relationships.artifact_links(),
    }
    return validate_artifact(artifact)


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
            json.dump(artifact, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
