from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.embeddings import (  # noqa: E402
    DEFAULT_EMBEDDING_DIMENSION,
    DEFAULT_EMBEDDING_MODEL,
    EmbeddingConfig,
    load_sentence_transformer_embedder,
    run_cross_language_sanity_check,
)


@unittest.skipUnless(
    os.getenv("AUAKA_RUN_REAL_EMBEDDING") == "1",
    "set AUAKA_RUN_REAL_EMBEDDING=1 to download/load the local model",
)
class RealEmbeddingIntegrationTest(unittest.TestCase):
    def test_selected_model_reports_expected_dimension_and_cross_language_signal(self) -> None:
        config = EmbeddingConfig(
            model=DEFAULT_EMBEDDING_MODEL,
            dimension=DEFAULT_EMBEDDING_DIMENSION,
            device=os.getenv("AUAKA_EMBEDDING_DEVICE", "auto"),
        )

        embedder = load_sentence_transformer_embedder(config)
        self.assertEqual(embedder.dimension, DEFAULT_EMBEDDING_DIMENSION)
        self.assertTrue(embedder.runtime_device)

        result = run_cross_language_sanity_check(embedder, threshold=0.3)
        self.assertGreaterEqual(result.similarity, result.threshold)


if __name__ == "__main__":
    unittest.main()
