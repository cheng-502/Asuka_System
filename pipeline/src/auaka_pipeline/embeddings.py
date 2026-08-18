"""Local note-level embedding services and validation helpers."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol, Sequence

import numpy as np

from .markdown import ParsedNote


DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3"
DEFAULT_EMBEDDING_DIMENSION = 1024


class EmbeddingError(RuntimeError):
    """Raised when an embedding batch cannot satisfy the pipeline contract."""


@dataclass(frozen=True, slots=True)
class EmbeddingConfig:
    """Reproducible configuration for one local embedding run."""

    model: str = DEFAULT_EMBEDDING_MODEL
    dimension: int = DEFAULT_EMBEDDING_DIMENSION
    normalized: bool = True
    metric: str = "cosine"
    device: str = "auto"
    cache_dir: Path = Path("data/model-cache")
    revision: str | None = None

    def __post_init__(self) -> None:
        if not self.model.strip():
            raise ValueError("embedding model must not be empty")
        if self.dimension <= 0:
            raise ValueError("embedding dimension must be positive")
        if self.metric != "cosine":
            raise ValueError("MVP-1 supports cosine embedding similarity only")

    def metadata(
        self,
        *,
        dimension: int | None = None,
        runtime_device: str | None = None,
    ) -> dict[str, object]:
        """Return JSON-safe metadata for caches and future artifact metadata."""

        return {
            "model": self.model,
            "revision": self.revision,
            "dimension": dimension or self.dimension,
            "metric": self.metric,
            "normalized": self.normalized,
            "device": self.device,
            "runtime_device": runtime_device or self.device,
        }


class TextEmbedder(Protocol):
    """Minimal adapter implemented by fake and SentenceTransformer embedders."""

    dimension: int
    runtime_device: str

    def encode(
        self, texts: Sequence[str], *, normalize_embeddings: bool
    ) -> np.ndarray:
        """Encode texts into a two-dimensional array."""


@dataclass(frozen=True, slots=True)
class EmbeddingBatch:
    """High-dimensional vectors and their deterministic note-row mapping."""

    note_ids: tuple[str, ...]
    content_hashes: tuple[str, ...]
    vectors: np.ndarray
    metadata: dict[str, object]

    def __post_init__(self) -> None:
        if self.vectors.ndim != 2:
            raise EmbeddingError("embedding vectors must be a two-dimensional array")
        if self.vectors.shape[0] != len(self.note_ids):
            raise EmbeddingError("embedding rows must match note ids")
        if len(self.note_ids) != len(self.content_hashes):
            raise EmbeddingError("note ids and content hashes must have equal length")


@dataclass(frozen=True, slots=True)
class CrossLanguageSanityCheck:
    chinese_text: str
    english_text: str
    similarity: float
    threshold: float

    @property
    def passed(self) -> bool:
        return self.similarity >= self.threshold


def note_embedding_text(note: ParsedNote) -> str:
    """Build stable note-level text without embedding the whole Markdown file."""

    return "\n\n".join(part for part in (note.title, note.summary) if part).strip()


def embed_notes(
    notes: Sequence[ParsedNote],
    embedder: TextEmbedder,
    config: EmbeddingConfig,
) -> EmbeddingBatch:
    """Encode notes and enforce the configured dimension and normalization."""

    if not notes:
        return EmbeddingBatch(
            note_ids=(),
            content_hashes=(),
            vectors=np.empty((0, config.dimension), dtype=np.float32),
            metadata=config.metadata(
                dimension=config.dimension,
                runtime_device=str(getattr(embedder, "runtime_device", config.device)),
            ),
        )

    texts = [note_embedding_text(note) for note in notes]
    try:
        raw_vectors = embedder.encode(texts, normalize_embeddings=config.normalized)
    except Exception as error:  # pragma: no cover - adapter-specific exception types
        raise EmbeddingError(f"embedding failed: {error}") from error

    vectors = np.asarray(raw_vectors, dtype=np.float32)
    if vectors.shape != (len(notes), config.dimension):
        raise EmbeddingError(
            "embedding shape mismatch: "
            f"expected {(len(notes), config.dimension)}, got {vectors.shape}"
        )
    if not np.isfinite(vectors).all():
        raise EmbeddingError("embedding output contains NaN or infinite values")

    if config.normalized:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        if np.any(norms <= np.finfo(np.float32).eps):
            raise EmbeddingError("cannot normalize a zero-length embedding vector")
        vectors = vectors / norms

    runtime_device = str(getattr(embedder, "runtime_device", config.device))
    return EmbeddingBatch(
        note_ids=tuple(note.note_id for note in notes),
        content_hashes=tuple(note.content_hash for note in notes),
        vectors=vectors,
        metadata=config.metadata(
            dimension=vectors.shape[1], runtime_device=runtime_device
        ),
    )


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    """Calculate cosine similarity while tolerating unnormalized adapter output."""

    left_vector = np.asarray(left, dtype=np.float32).reshape(-1)
    right_vector = np.asarray(right, dtype=np.float32).reshape(-1)
    if left_vector.shape != right_vector.shape:
        raise EmbeddingError("cosine vectors must have equal dimensions")
    left_norm = np.linalg.norm(left_vector)
    right_norm = np.linalg.norm(right_vector)
    if left_norm <= np.finfo(np.float32).eps or right_norm <= np.finfo(np.float32).eps:
        raise EmbeddingError("cosine similarity requires non-zero vectors")
    return float(np.dot(left_vector, right_vector) / (left_norm * right_norm))


def run_cross_language_sanity_check(
    embedder: TextEmbedder,
    *,
    chinese_text: str = "目标检测",
    english_text: str = "object detection",
    threshold: float = 0.5,
) -> CrossLanguageSanityCheck:
    """Check that the selected multilingual model places a concept pair nearby."""

    try:
        vectors = np.asarray(
            embedder.encode(
                [chinese_text, english_text], normalize_embeddings=False
            ),
            dtype=np.float32,
        )
    except Exception as error:  # pragma: no cover - adapter-specific exception types
        raise EmbeddingError(f"cross-language check failed: {error}") from error
    if vectors.shape != (2, getattr(embedder, "dimension", vectors.shape[-1])):
        raise EmbeddingError(f"cross-language output has unexpected shape: {vectors.shape}")
    similarity = cosine_similarity(vectors[0], vectors[1])
    return CrossLanguageSanityCheck(
        chinese_text=chinese_text,
        english_text=english_text,
        similarity=similarity,
        threshold=threshold,
    )


class SentenceTransformerEmbedder:
    """Local adapter for SentenceTransformers with a persistent model cache."""

    def __init__(self, config: EmbeddingConfig) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as error:  # pragma: no cover - optional integration path
            raise EmbeddingError(
                "sentence-transformers is not installed; "
                "run `python -m pip install -e '.[embedding]'`"
            ) from error

        kwargs: dict[str, object] = {"cache_folder": str(config.cache_dir)}
        if config.device != "auto":
            kwargs["device"] = config.device
        try:
            self._model = SentenceTransformer(config.model, **kwargs)
        except Exception as error:  # pragma: no cover - model/network dependent
            raise EmbeddingError(
                f"could not load embedding model {config.model!r}: {error}"
            ) from error

        dimension = self._model.get_sentence_embedding_dimension()
        if dimension is None:
            raise EmbeddingError("embedding model did not report its dimension")
        self.dimension = int(dimension)
        self.runtime_device = str(getattr(self._model, "device", config.device))

    def encode(
        self, texts: Sequence[str], *, normalize_embeddings: bool
    ) -> np.ndarray:
        try:
            vectors = self._model.encode(
                list(texts),
                normalize_embeddings=normalize_embeddings,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        except Exception as error:  # pragma: no cover - model/runtime dependent
            raise EmbeddingError(f"model encoding failed: {error}") from error
        return np.asarray(vectors, dtype=np.float32)


@lru_cache(maxsize=4)
def load_sentence_transformer_embedder(
    config: EmbeddingConfig,
) -> SentenceTransformerEmbedder:
    """Reuse a loaded local model during one pipeline process.

    SentenceTransformers also reuses files under ``cache_dir`` across processes;
    this cache avoids constructing the same model more than once per run.
    """

    return SentenceTransformerEmbedder(config)
