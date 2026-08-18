from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.embeddings import EmbeddingBatch  # noqa: E402
from auaka_pipeline.projection import UmapConfig, project_embeddings  # noqa: E402


class ProjectionTest(unittest.TestCase):
    def test_default_umap_spacing_is_recorded_in_artifact_metadata(self) -> None:
        config = UmapConfig()

        self.assertEqual(config.n_neighbors, 15)
        self.assertEqual(config.min_dist, 0.25)
        self.assertEqual(config.artifact_metadata()["min_dist"], 0.25)

    def test_umap_projection_is_three_dimensional_and_deterministic(self) -> None:
        vectors = np.asarray(
            [
                [1.0, 0.0, 0.0, 0.0],
                [0.9, 0.1, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.9, 0.1, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            dtype=np.float32,
        )
        batch = EmbeddingBatch(
            note_ids=tuple(f"{index}.md" for index in range(len(vectors))),
            content_hashes=tuple(str(index) for index in range(len(vectors))),
            vectors=vectors,
            metadata={"model": "fake", "dimension": 4, "normalized": False},
        )
        config = UmapConfig(n_neighbors=3, random_state=42)

        first = project_embeddings(batch, config)
        second = project_embeddings(batch, config)

        self.assertEqual(first.shape, (6, 3))
        self.assertTrue(np.isfinite(first).all())
        np.testing.assert_allclose(first, second, rtol=1e-5, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
