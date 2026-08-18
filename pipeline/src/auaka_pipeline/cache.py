"""Persistent high-dimensional embedding cache kept outside browser artifacts."""

from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .embeddings import EmbeddingBatch


class EmbeddingCacheError(ValueError):
    """Raised when an embedding cache is missing or internally inconsistent."""


@dataclass(frozen=True, slots=True)
class LoadedEmbeddingCache:
    note_ids: tuple[str, ...]
    content_hashes: tuple[str, ...]
    vectors: np.ndarray
    metadata: dict[str, object]


def save_embedding_cache(batch: EmbeddingBatch, cache_dir: Path) -> None:
    """Write vectors and their row index atomically to a local cache directory."""

    cache_dir.mkdir(parents=True, exist_ok=True)
    vectors_path = cache_dir / "embeddings.npy"
    index_path = cache_dir / "embedding-index.json"
    entries = [
        {
            "note_id": note_id,
            "content_hash": content_hash,
            "row": row,
        }
        for row, (note_id, content_hash) in enumerate(
            zip(batch.note_ids, batch.content_hashes)
        )
    ]
    index = {
        "version": 1,
        "embedding": batch.metadata,
        "shape": list(batch.vectors.shape),
        "entries": entries,
    }

    _atomic_save_numpy(batch.vectors, vectors_path, cache_dir)
    _atomic_save_json(index, index_path, cache_dir)


def load_embedding_cache(cache_dir: Path) -> LoadedEmbeddingCache:
    """Load and validate a vector matrix plus its note-row index."""

    vectors_path = cache_dir / "embeddings.npy"
    index_path = cache_dir / "embedding-index.json"
    if not vectors_path.is_file() or not index_path.is_file():
        raise EmbeddingCacheError(f"incomplete embedding cache: {cache_dir}")

    try:
        vectors = np.load(vectors_path, allow_pickle=False)
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise EmbeddingCacheError(f"could not read embedding cache: {error}") from error

    if index.get("version") != 1:
        raise EmbeddingCacheError("unsupported embedding cache version")
    if not isinstance(index.get("embedding"), dict):
        raise EmbeddingCacheError("embedding cache metadata is missing")
    if vectors.ndim != 2 or list(vectors.shape) != index.get("shape"):
        raise EmbeddingCacheError("embedding cache shape does not match its index")

    entries = index.get("entries")
    if not isinstance(entries, list) or len(entries) != vectors.shape[0]:
        raise EmbeddingCacheError("embedding cache row index does not match vectors")
    if [entry.get("row") for entry in entries] != list(range(len(entries))):
        raise EmbeddingCacheError("embedding cache rows must be contiguous and ordered")
    if any(not isinstance(entry.get("note_id"), str) for entry in entries):
        raise EmbeddingCacheError("embedding cache contains an invalid note id")
    if any(not isinstance(entry.get("content_hash"), str) for entry in entries):
        raise EmbeddingCacheError("embedding cache contains an invalid content hash")

    return LoadedEmbeddingCache(
        note_ids=tuple(entry["note_id"] for entry in entries),
        content_hashes=tuple(entry["content_hash"] for entry in entries),
        vectors=np.asarray(vectors, dtype=np.float32),
        metadata=dict(index["embedding"]),
    )


def _atomic_save_numpy(vectors: np.ndarray, destination: Path, directory: Path) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix="embeddings-", suffix=".tmp", dir=directory, delete=False
        ) as handle:
            temporary_path = Path(handle.name)
            np.save(handle, vectors, allow_pickle=False)
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def _atomic_save_json(
    payload: dict[str, object], destination: Path, directory: Path
) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix="embedding-index-",
            suffix=".tmp",
            dir=directory,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
