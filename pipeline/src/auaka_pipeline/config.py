"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .embeddings import (
    DEFAULT_EMBEDDING_DIMENSION,
    DEFAULT_EMBEDDING_MODEL,
    EmbeddingConfig,
)


DEFAULT_VAULT_PATH = Path(r"C:\Users\lin20\Desktop\广药文件\Obsidian Vault")
DEFAULT_HAND_MODEL_PATH = Path("frontend/public/models/hand_landmarker.task")
DEFAULT_MODEL_CACHE_PATH = Path("data/model-cache")
DEFAULT_CHUNK_INDEX_PATH = Path("data/chunks")


@dataclass(frozen=True, slots=True)
class RuntimeConfig:
    """Paths shared by offline indexing and the local browser demo."""

    vault_path: Path
    hand_model_path: Path
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    embedding_dimension: int = DEFAULT_EMBEDDING_DIMENSION
    embedding_device: str = "auto"
    embedding_cache_path: Path = DEFAULT_MODEL_CACHE_PATH
    chunk_index_path: Path = DEFAULT_CHUNK_INDEX_PATH

    @property
    def embedding_config(self) -> EmbeddingConfig:
        """Return the embedding settings used by the offline pipeline."""

        return EmbeddingConfig(
            model=self.embedding_model,
            dimension=self.embedding_dimension,
            device=self.embedding_device,
            cache_dir=self.embedding_cache_path,
        )

    @classmethod
    def from_env(cls) -> RuntimeConfig:
        """Create configuration using environment overrides and safe defaults."""

        return cls(
            vault_path=Path(os.getenv("AUAKA_VAULT_PATH", str(DEFAULT_VAULT_PATH))),
            hand_model_path=Path(
                os.getenv("AUAKA_HAND_MODEL_PATH", str(DEFAULT_HAND_MODEL_PATH))
            ),
            embedding_model=os.getenv("AUAKA_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
            embedding_dimension=int(
                os.getenv("AUAKA_EMBEDDING_DIMENSION", str(DEFAULT_EMBEDDING_DIMENSION))
            ),
            embedding_device=os.getenv("AUAKA_EMBEDDING_DEVICE", "auto"),
            embedding_cache_path=Path(
                os.getenv("AUAKA_MODEL_CACHE_PATH", str(DEFAULT_MODEL_CACHE_PATH))
            ),
            chunk_index_path=Path(
                os.getenv("AUAKA_CHUNK_INDEX_PATH", str(DEFAULT_CHUNK_INDEX_PATH))
            ),
        )
