"""Deterministic offline UMAP projection for the browser-facing artifact."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .embeddings import EmbeddingBatch


class ProjectionError(ValueError):
    """Raised when embeddings cannot be projected into the MVP-1 space."""


@dataclass(frozen=True, slots=True)
class UmapConfig:
    n_components: int = 3
    random_state: int = 42
    metric: str = "cosine"
    n_neighbors: int = 15
    min_dist: float = 0.1

    def __post_init__(self) -> None:
        if self.n_components != 3:
            raise ValueError("MVP-1 UMAP projection must have n_components=3")
        if self.metric != "cosine":
            raise ValueError("MVP-1 projection uses cosine distance")
        if self.n_neighbors <= 0:
            raise ValueError("n_neighbors must be positive")
        if not 0 <= self.min_dist <= 1:
            raise ValueError("min_dist must be between 0 and 1")

    def artifact_metadata(self) -> dict[str, object]:
        return {
            "n_components": self.n_components,
            "random_state": self.random_state,
            "metric": self.metric,
        }


def project_embeddings(batch: EmbeddingBatch, config: UmapConfig) -> np.ndarray:
    """Project high-dimensional vectors while persisting only 3D coordinates."""

    vectors = np.asarray(batch.vectors, dtype=np.float32)
    if vectors.ndim != 2:
        raise ProjectionError("embedding vectors must be two-dimensional")
    if not np.isfinite(vectors).all():
        raise ProjectionError("embedding vectors contain NaN or infinite values")

    note_count = vectors.shape[0]
    if note_count == 0:
        return np.empty((0, config.n_components), dtype=np.float32)
    if note_count == 1:
        return np.zeros((1, config.n_components), dtype=np.float32)
    if note_count == 2:
        return np.asarray([[-0.5, 0.0, 0.0], [0.5, 0.0, 0.0]], dtype=np.float32)

    try:
        import umap
    except ImportError as error:  # pragma: no cover - dependency installation path
        raise ProjectionError(
            "umap-learn is not installed; install the pipeline dependencies"
        ) from error

    reducer = umap.UMAP(
        n_components=config.n_components,
        random_state=config.random_state,
        metric=config.metric,
        n_neighbors=min(config.n_neighbors, note_count - 1),
        min_dist=config.min_dist,
        transform_seed=config.random_state,
    )
    try:
        coordinates = reducer.fit_transform(vectors)
    except Exception as error:  # pragma: no cover - library/runtime dependent
        raise ProjectionError(f"UMAP projection failed: {error}") from error

    coordinates = np.asarray(coordinates, dtype=np.float32)
    if coordinates.shape != (note_count, config.n_components):
        raise ProjectionError(
            f"UMAP returned unexpected shape {coordinates.shape}; "
            f"expected {(note_count, config.n_components)}"
        )
    if not np.isfinite(coordinates).all():
        raise ProjectionError("UMAP returned NaN or infinite coordinates")
    return coordinates
