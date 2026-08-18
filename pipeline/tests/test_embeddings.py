from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.cache import load_embedding_cache, save_embedding_cache
from auaka_pipeline.embeddings import (
    EmbeddingConfig,
    EmbeddingError,
    embed_notes,
    run_cross_language_sanity_check,
)
from auaka_pipeline.markdown import ParsedNote


class FakeEmbedder:
    dimension = 3
    runtime_device = "cpu"

    def encode(self, texts: list[str], *, normalize_embeddings: bool) -> np.ndarray:
        del normalize_embeddings
        rows = []
        for text in texts:
            if "目标检测" in text or "object detection" in text:
                rows.append([3.0, 4.0, 0.0])
            else:
                rows.append([0.0, 0.0, 5.0])
        return np.asarray(rows, dtype=np.float32)


class BrokenEmbedder(FakeEmbedder):
    def encode(self, texts: list[str], *, normalize_embeddings: bool) -> np.ndarray:
        del texts, normalize_embeddings
        return np.asarray([[1.0, 2.0]], dtype=np.float32)


def note(note_id: str, title: str, summary: str, content_hash: str) -> ParsedNote:
    return ParsedNote(
        note_id=note_id,
        title=title,
        summary=summary,
        domain="root",
        wikilinks=(),
        content_hash=content_hash,
    )


class EmbeddingTest(unittest.TestCase):
    def test_embed_notes_normalizes_vectors_and_preserves_note_mapping(self) -> None:
        config = EmbeddingConfig(
            model="fake-multilingual",
            dimension=3,
            device="cpu",
        )
        notes = [
            note("目标检测.md", "目标检测", "视觉算法", "hash-cn"),
            note("object-detection.md", "object detection", "vision algorithm", "hash-en"),
        ]

        batch = embed_notes(notes, FakeEmbedder(), config)

        self.assertEqual(batch.note_ids, ("目标检测.md", "object-detection.md"))
        self.assertEqual(batch.content_hashes, ("hash-cn", "hash-en"))
        self.assertEqual(batch.vectors.shape, (2, 3))
        np.testing.assert_allclose(np.linalg.norm(batch.vectors, axis=1), [1.0, 1.0])
        self.assertEqual(batch.metadata["model"], "fake-multilingual")
        self.assertEqual(batch.metadata["dimension"], 3)
        self.assertTrue(batch.metadata["normalized"])
        self.assertEqual(batch.metadata["runtime_device"], "cpu")

    def test_cross_language_sanity_check_compares_chinese_and_english_pair(self) -> None:
        result = run_cross_language_sanity_check(FakeEmbedder())

        self.assertEqual(result.chinese_text, "目标检测")
        self.assertEqual(result.english_text, "object detection")
        self.assertAlmostEqual(result.similarity, 1.0)
        self.assertTrue(result.passed)

    def test_embedding_shape_failure_stops_before_cache_write(self) -> None:
        config = EmbeddingConfig(model="fake", dimension=3, device="cpu")

        with self.assertRaises(EmbeddingError):
            embed_notes([note("broken.md", "Broken", "", "hash")], BrokenEmbedder(), config)

    def test_empty_note_collection_produces_empty_matrix_with_known_dimension(self) -> None:
        config = EmbeddingConfig(model="fake", dimension=3, device="cpu")

        batch = embed_notes([], FakeEmbedder(), config)

        self.assertEqual(batch.vectors.shape, (0, 3))
        self.assertEqual(batch.note_ids, ())
        self.assertEqual(batch.metadata["dimension"], 3)


class EmbeddingCacheTest(unittest.TestCase):
    def test_cache_round_trip_keeps_vectors_and_index_outside_artifact(self) -> None:
        config = EmbeddingConfig(model="fake-multilingual", dimension=3, device="cpu")
        batch = embed_notes(
            [note("a.md", "目标检测", "", "hash-a")], FakeEmbedder(), config
        )

        with tempfile.TemporaryDirectory() as temporary_dir:
            cache_dir = Path(temporary_dir) / "embeddings"
            save_embedding_cache(batch, cache_dir)
            loaded = load_embedding_cache(cache_dir)

            self.assertEqual(loaded.note_ids, ("a.md",))
            self.assertEqual(loaded.content_hashes, ("hash-a",))
            np.testing.assert_allclose(loaded.vectors, batch.vectors)
            self.assertEqual(loaded.metadata["model"], "fake-multilingual")
            self.assertTrue((cache_dir / "embeddings.npy").exists())
            self.assertTrue((cache_dir / "embedding-index.json").exists())


if __name__ == "__main__":
    unittest.main()
