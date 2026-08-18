"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


DEFAULT_VAULT_PATH = Path(r"C:\Users\lin20\Desktop\广药文件\Obsidian Vault")
DEFAULT_HAND_MODEL_PATH = Path("frontend/public/models/hand_landmarker.task")


@dataclass(frozen=True, slots=True)
class RuntimeConfig:
    """Paths shared by offline indexing and the local browser demo."""

    vault_path: Path
    hand_model_path: Path

    @classmethod
    def from_env(cls) -> RuntimeConfig:
        """Create configuration using environment overrides and safe defaults."""

        return cls(
            vault_path=Path(os.getenv("AUAKA_VAULT_PATH", str(DEFAULT_VAULT_PATH))),
            hand_model_path=Path(
                os.getenv("AUAKA_HAND_MODEL_PATH", str(DEFAULT_HAND_MODEL_PATH))
            ),
        )
