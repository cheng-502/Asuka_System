from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.config import RuntimeConfig  # noqa: E402
from auaka_pipeline.generate import generate_from_vault  # noqa: E402
from auaka_pipeline.models import validate_artifact  # noqa: E402


class FakeEmbedder:
    dimension = 3
    runtime_device = "cpu"
    revision = "fixture-revision"

    def encode(self, texts: list[str], *, normalize_embeddings: bool) -> np.ndarray:
        del normalize_embeddings
        vectors = np.zeros((len(texts), 3), dtype=np.float32)
        for index in range(len(texts)):
            vectors[index, index % 3] = 1.0
        return vectors


class GenerateTest(unittest.TestCase):
    def test_generates_valid_v2_atomically_with_hierarchy_diagnostics(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            vault = root / "vault"
            vault.mkdir()
            hub_path = vault / "hub.md"
            note_path = vault / "note.md"
            hub_path.write_text("---\nknowledge_role: hub\n---\n# Hub", encoding="utf-8")
            note_path.write_text(
                "---\nknowledge_parent: [[missing]]\n---\n# Note\n\nContent.",
                encoding="utf-8",
            )
            original = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in (hub_path, note_path)}
            artifact_path = root / "knowledge-space.json"
            config = RuntimeConfig(
                vault_path=vault,
                hand_model_path=Path("hand.task"),
                embedding_model="fake",
                embedding_dimension=3,
                embedding_device="cpu",
                embedding_cache_path=root / "model-cache",
            )

            with patch(
                "auaka_pipeline.generate.load_sentence_transformer_embedder",
                return_value=FakeEmbedder(),
            ):
                report = generate_from_vault(
                    vault_path=vault,
                    artifact_path=artifact_path,
                    embedding_cache_path=root / "embeddings",
                    runtime_config=config,
                    min_similarity=0.60,
                )

            artifact = validate_artifact(json.loads(artifact_path.read_text(encoding="utf-8")))

            self.assertEqual(artifact["version"], 2)
            self.assertEqual(report["hierarchy"]["assignment_counts"], {"explicit": 1, "folder": 1})
            self.assertEqual(report["hierarchy"]["warnings"][0]["code"], "unresolved_parent")
            self.assertEqual(artifact["layout_generation"]["galaxy"]["seed"], 42)
            self.assertEqual(report["relationship_generation"]["min_similarity"], 0.60)
            self.assertEqual(report["relationship_generation"]["hierarchy_min_similarity"], 0.60)
            for path, (content, modified) in original.items():
                self.assertEqual(path.read_bytes(), content)
                self.assertEqual(path.stat().st_mtime_ns, modified)


if __name__ == "__main__":
    unittest.main()
