"""Chunk embedding cache and exact local cosine retrieval."""

from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from .chunks import ChunkingConfig, KnowledgeChunk, chunk_notes
from .embeddings import EmbeddingConfig, EmbeddingError, TextEmbedder
from .markdown import ParsedNote


class RetrievalError(RuntimeError):
    """Raised when the local retrieval index cannot satisfy its contract."""


class ChunkIndexCacheError(ValueError):
    """Raised when a persisted chunk index is incomplete or inconsistent."""


@dataclass(frozen=True, slots=True)
class SearchHit:
    chunk: KnowledgeChunk
    score: float

    def to_dict(self) -> dict[str, object]:
        result = self.chunk.to_dict()
        result["score"] = self.score
        return result


@dataclass(frozen=True, slots=True)
class ChunkVectorIndex:
    chunks: tuple[KnowledgeChunk, ...]
    vectors: np.ndarray
    metadata: dict[str, object]

    def __post_init__(self) -> None:
        vectors = np.asarray(self.vectors, dtype=np.float32)
        if vectors.ndim != 2 or vectors.shape[0] != len(self.chunks):
            raise ChunkIndexCacheError("chunk vectors do not match chunk records")
        if not np.isfinite(vectors).all():
            raise ChunkIndexCacheError("chunk vectors contain NaN or infinite values")
        object.__setattr__(self, "vectors", vectors)

    @property
    def dimension(self) -> int:
        return int(self.vectors.shape[1])

    def search(
        self,
        query_vector: np.ndarray,
        *,
        top_k: int = 5,
        min_score: float | None = None,
        note_id: str | None = None,
    ) -> tuple[SearchHit, ...]:
        if top_k <= 0:
            raise ValueError("top_k must be positive")
        vector = _normalize_query(query_vector, self.dimension)
        if not len(self.chunks):
            return ()
        scores = self.vectors @ vector
        candidates = [
            (index, float(score))
            for index, score in enumerate(scores)
            if (note_id is None or self.chunks[index].note_id == note_id)
            and (min_score is None or float(score) >= min_score)
        ]
        candidates.sort(key=lambda item: (-item[1], self.chunks[item[0]].chunk_id))
        return tuple(SearchHit(self.chunks[index], score) for index, score in candidates[:top_k])


@dataclass(frozen=True, slots=True)
class ChunkIndexBuildReport:
    total_count: int
    encoded_count: int
    reused_count: int
    added_count: int
    changed_count: int
    removed_count: int

    def to_dict(self) -> dict[str, int]:
        return {
            "total_count": self.total_count,
            "encoded_count": self.encoded_count,
            "reused_count": self.reused_count,
            "added_count": self.added_count,
            "changed_count": self.changed_count,
            "removed_count": self.removed_count,
        }


@dataclass(frozen=True, slots=True)
class ChunkIndexBuildResult:
    chunks: tuple[KnowledgeChunk, ...]
    index: ChunkVectorIndex
    report: ChunkIndexBuildReport

    def service(self, query_embedder: TextEmbedder) -> "RetrievalService":
        return RetrievalService(self.index, query_embedder)


class RetrievalService:
    """Application boundary between a query embedder and the vector index."""

    def __init__(self, index: ChunkVectorIndex, query_embedder: TextEmbedder) -> None:
        if int(getattr(query_embedder, "dimension", -1)) != index.dimension:
            raise RetrievalError(f"query embedder dimension does not match index: {getattr(query_embedder, 'dimension', None)} != {index.dimension}")
        self._index = index
        self._query_embedder = query_embedder

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        min_score: float | None = None,
        note_id: str | None = None,
    ) -> tuple[SearchHit, ...]:
        if not query or not query.strip():
            raise ValueError("query must not be empty")
        if top_k < 1 or top_k > 50:
            raise ValueError("top_k must be between 1 and 50")
        if min_score is not None and not -1.0 <= min_score <= 1.0:
            raise ValueError("min_score must be between -1 and 1")
        try:
            vectors = self._query_embedder.encode(
                [query.strip()], normalize_embeddings=True
            )
        except Exception as error:  # pragma: no cover - adapter-specific failures
            raise RetrievalError(f"query embedding failed: {error}") from error
        vector = np.asarray(vectors, dtype=np.float32)
        if vector.shape != (1, self._index.dimension):
            raise RetrievalError(
                "query embedding shape mismatch: "
                f"expected {(1, self._index.dimension)}, got {vector.shape}"
            )
        return self._index.search(
            vector[0], top_k=top_k, min_score=min_score, note_id=note_id
        )


def build_chunk_index(
    notes: Sequence[ParsedNote],
    embedder: TextEmbedder,
    *,
    cache_dir: Path,
    chunking_config: ChunkingConfig | None = None,
    embedding_config: EmbeddingConfig | None = None,
) -> ChunkIndexBuildResult:
    """Build or incrementally update a chunk index and persist it atomically."""
    chunks = tuple(
        sorted(chunk_notes(notes, chunking_config), key=lambda item: item.chunk_id)
    )
    config = embedding_config or EmbeddingConfig(
        model=str(getattr(embedder, "model", "local-embedder")),
        dimension=int(getattr(embedder, "dimension")),
        device=str(getattr(embedder, "runtime_device", "auto")),
        revision=getattr(embedder, "revision", None),
    )
    metadata = _cache_metadata(config, chunking_config or ChunkingConfig(), embedder)
    previous = _try_load_index(cache_dir)
    reusable: dict[str, np.ndarray] = {}
    previous_by_id: dict[str, KnowledgeChunk] = {}
    if previous is not None and _same_cache_context(previous.metadata, metadata):
        previous_by_id = {chunk.chunk_id: chunk for chunk in previous.chunks}
        current_by_id = {chunk.chunk_id: chunk for chunk in chunks}
        reusable = {}
        for row, chunk in enumerate(previous.chunks):
            if (
                chunk.chunk_id in current_by_id
                and current_by_id[chunk.chunk_id].content_hash == chunk.content_hash
            ):
                reusable[chunk.chunk_id] = previous.vectors[row]
    pending = [chunk for chunk in chunks if chunk.chunk_id not in reusable]
    encoded_vectors = _encode_chunks(pending, embedder, config)
    encoded_by_id = {
        chunk.chunk_id: encoded_vectors[row] for row, chunk in enumerate(pending)
    }
    vectors = np.asarray(
        [
            reusable[chunk.chunk_id]
            if chunk.chunk_id in reusable
            else encoded_by_id[chunk.chunk_id]
            for chunk in chunks
        ],
        dtype=np.float32,
    )
    index = ChunkVectorIndex(chunks=chunks, vectors=vectors, metadata=metadata)
    save_chunk_index(index, cache_dir)
    current_ids = {chunk.chunk_id for chunk in chunks}
    previous_ids = set(previous_by_id)
    report = ChunkIndexBuildReport(
        total_count=len(chunks),
        encoded_count=len(pending),
        reused_count=len(chunks) - len(pending),
        added_count=sum(chunk.chunk_id not in previous_ids for chunk in pending),
        changed_count=sum(
            chunk.chunk_id in previous_ids
            and previous_by_id[chunk.chunk_id].content_hash != chunk.content_hash
            for chunk in pending
        ),
        removed_count=len(previous_ids - current_ids),
    )
    return ChunkIndexBuildResult(chunks=chunks, index=index, report=report)


def save_chunk_index(index: ChunkVectorIndex, cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for row, chunk in enumerate(index.chunks):
        record = chunk.to_dict()
        record["row"] = row
        entries.append(record)
    payload = {
        "version": 1,
        "metadata": index.metadata,
        "shape": list(index.vectors.shape),
        "entries": entries,
    }
    _atomic_save_numpy(index.vectors, cache_dir / "chunk-vectors.npy", cache_dir)
    _atomic_save_json(payload, cache_dir / "chunk-index.json", cache_dir)


def load_chunk_index(cache_dir: Path) -> ChunkVectorIndex:
    vectors_path = cache_dir / "chunk-vectors.npy"
    index_path = cache_dir / "chunk-index.json"
    if not vectors_path.is_file() or not index_path.is_file():
        raise ChunkIndexCacheError(f"incomplete chunk index: {cache_dir}")
    try:
        vectors = np.asarray(np.load(vectors_path, allow_pickle=False), dtype=np.float32)
        payload = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise ChunkIndexCacheError(f"could not read chunk index: {error}") from error
    entries = payload.get("entries")
    if payload.get("version") != 1 or not isinstance(payload.get("metadata"), dict):
        raise ChunkIndexCacheError("unsupported chunk index metadata")
    if vectors.ndim != 2 or list(vectors.shape) != payload.get("shape"):
        raise ChunkIndexCacheError("chunk index shape does not match its metadata")
    if not isinstance(entries, list) or len(entries) != vectors.shape[0]:
        raise ChunkIndexCacheError("chunk index rows do not match its records")
    chunks: list[KnowledgeChunk] = []
    try:
        for row, entry in enumerate(entries):
            if entry.get("row") != row:
                raise ChunkIndexCacheError("chunk index rows must be contiguous and ordered")
            chunks.append(
                KnowledgeChunk(
                    chunk_id=str(entry["chunk_id"]),
                    note_id=str(entry["note_id"]),
                    title=str(entry["title"]),
                    heading_path=tuple(
                        str(item) for item in entry.get("heading_path", [])
                    ),
                    content=str(entry["content"]),
                    start_offset=int(entry["start_offset"]),
                    end_offset=int(entry["end_offset"]),
                    content_hash=str(entry["content_hash"]),
                    ordinal=int(entry.get("ordinal", row)),
                )
            )
    except (KeyError, TypeError, ValueError) as error:
        raise ChunkIndexCacheError(f"invalid chunk record: {error}") from error
    return ChunkVectorIndex(tuple(chunks), vectors, dict(payload["metadata"]))


def _encode_chunks(
    chunks: Sequence[KnowledgeChunk],
    embedder: TextEmbedder,
    config: EmbeddingConfig,
) -> np.ndarray:
    if not chunks:
        return np.empty((0, config.dimension), dtype=np.float32)
    try:
        raw = embedder.encode(
            [chunk.embedding_text() for chunk in chunks],
            normalize_embeddings=config.normalized,
        )
    except Exception as error:  # pragma: no cover - adapter-specific failures
        raise EmbeddingError(f"chunk embedding failed: {error}") from error
    vectors = np.asarray(raw, dtype=np.float32)
    if vectors.shape != (len(chunks), config.dimension):
        raise EmbeddingError(
            "chunk embedding shape mismatch: "
            f"expected {(len(chunks), config.dimension)}, got {vectors.shape}"
        )
    if not np.isfinite(vectors).all():
        raise EmbeddingError("chunk embedding output contains NaN or infinite values")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms <= np.finfo(np.float32).eps):
        raise EmbeddingError("cannot normalize a zero-length chunk embedding vector")
    return vectors / norms


def _cache_metadata(
    config: EmbeddingConfig,
    chunking: ChunkingConfig,
    embedder: TextEmbedder,
) -> dict[str, object]:
    metadata = config.metadata(
        dimension=int(getattr(embedder, "dimension", config.dimension)),
        runtime_device=str(getattr(embedder, "runtime_device", config.device)),
    )
    metadata["revision"] = getattr(embedder, "revision", None) or config.revision
    return {"embedding": metadata, "chunking": chunking.metadata()}


def _same_cache_context(left: dict[str, object], right: dict[str, object]) -> bool:
    return json.dumps(left, sort_keys=True, ensure_ascii=False) == json.dumps(
        right, sort_keys=True, ensure_ascii=False
    )


def _try_load_index(cache_dir: Path) -> ChunkVectorIndex | None:
    if not (cache_dir / "chunk-vectors.npy").is_file() and not (
        cache_dir / "chunk-index.json"
    ).is_file():
        return None
    return load_chunk_index(cache_dir)


def _normalize_query(vector: np.ndarray, dimension: int) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float32).reshape(-1)
    if array.shape != (dimension,):
        raise RetrievalError(
            f"query vector dimension mismatch: expected {dimension}, got {array.shape}"
        )
    norm = np.linalg.norm(array)
    if norm <= np.finfo(np.float32).eps:
        raise RetrievalError("query vector must not be zero")
    return array / norm


def _atomic_save_numpy(vectors: np.ndarray, destination: Path, directory: Path) -> None:
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", prefix="chunk-vectors-", suffix=".tmp", dir=directory, delete=False) as handle:
            temporary_path = Path(handle.name)
            np.save(handle, vectors, allow_pickle=False)
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def _atomic_save_json(payload: dict[str, object], destination: Path, directory: Path) -> None:
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="chunk-index-", suffix=".tmp", dir=directory, delete=False) as handle:
            temporary_path = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        temporary_path.replace(destination)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
