from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.chunks import ChunkingConfig, chunk_note
from auaka_pipeline.markdown import parse_markdown
from auaka_pipeline.retrieval import build_chunk_index, load_chunk_index
from auaka_pipeline.service import create_search_server


class MappingEmbedder:
    dimension = 3
    runtime_device = "cpu"
    revision = "fake-revision"

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, texts: list[str], *, normalize_embeddings: bool) -> np.ndarray:
        self.calls.append(list(texts))
        rows = []
        for text in texts:
            if "目标检测" in text or "object detection" in text:
                rows.append([1.0, 0.0, 0.0])
            elif "数据集" in text:
                rows.append([0.0, 1.0, 0.0])
            else:
                rows.append([0.0, 0.0, 1.0])
        return np.asarray(rows, dtype=np.float32)


def note(note_id: str, content: str):
    return parse_markdown(content, note_id, content_hash=f"hash-{note_id}")


class RetrievalTest(unittest.TestCase):
    def test_incremental_build_reuses_unchanged_chunk_embeddings(self) -> None:
        notes = [note("vision.md", "# Vision\n\n目标检测内容")]
        with tempfile.TemporaryDirectory() as temporary_dir:
            cache_dir = Path(temporary_dir) / "chunks"
            first_embedder = MappingEmbedder()
            first = build_chunk_index(notes, first_embedder, cache_dir=cache_dir)
            self.assertEqual(first.report.encoded_count, len(first.chunks))

            second_embedder = MappingEmbedder()
            second = build_chunk_index(notes, second_embedder, cache_dir=cache_dir)
            self.assertEqual(second.report.reused_count, len(second.chunks))
            self.assertEqual(second.report.encoded_count, 0)
            self.assertEqual(second_embedder.calls, [])
            loaded = load_chunk_index(cache_dir)
            self.assertEqual(loaded.chunks[0].chunk_id, first.chunks[0].chunk_id)

    def test_exact_cosine_search_returns_chunk_metadata_in_rank_order(self) -> None:
        notes = [
            note("vision.md", "# Vision\n\n目标检测内容"),
            note("dataset.md", "# 数据集\n\n数据集内容"),
        ]
        with tempfile.TemporaryDirectory() as temporary_dir:
            result = build_chunk_index(notes, MappingEmbedder(), cache_dir=Path(temporary_dir))
            response = result.index.search(np.asarray([1.0, 0.0, 0.0]), top_k=1)

        self.assertEqual(len(response), 1)
        self.assertEqual(response[0].chunk.note_id, "vision.md")
        self.assertAlmostEqual(response[0].score, 1.0)

    def test_incremental_build_encodes_changed_and_new_chunks_and_removes_deleted(self) -> None:
        first_notes = [
            note("a.md", "# A\n\n目标检测内容"),
            note("b.md", "# B\n\n数据集内容"),
        ]
        second_notes = [
            note("a.md", "# A\n\n目标检测内容已经更新"),
            note("c.md", "# C\n\n新的内容"),
        ]
        with tempfile.TemporaryDirectory() as temporary_dir:
            cache_dir = Path(temporary_dir)
            build_chunk_index(first_notes, MappingEmbedder(), cache_dir=cache_dir)
            result = build_chunk_index(second_notes, MappingEmbedder(), cache_dir=cache_dir)

        self.assertEqual(result.report.encoded_count, 2)
        self.assertEqual(result.report.changed_count, 1)
        self.assertEqual(result.report.added_count, 1)
        self.assertEqual(result.report.removed_count, 1)


class SearchApiTest(unittest.TestCase):
    def test_search_endpoint_returns_results_and_structured_validation_errors(self) -> None:
        notes = [note("vision.md", "# Vision\n\n目标检测内容")]
        with tempfile.TemporaryDirectory() as temporary_dir:
            result = build_chunk_index(notes, MappingEmbedder(), cache_dir=Path(temporary_dir))
            server = create_search_server(result.service(MappingEmbedder()), host="127.0.0.1", port=0)
            server_thread = __import__("threading").Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_address[1]}/search"
                request = Request(
                    url,
                    data=json.dumps({"query": "目标检测", "top_k": 1}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(request) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                self.assertEqual(payload["results"][0]["note_id"], "vision.md")
                self.assertIn("score", payload["results"][0])

                invalid = Request(
                    url,
                    data=json.dumps({"query": ""}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as context:
                    urlopen(invalid)
                error = json.loads(context.exception.read().decode("utf-8"))
                self.assertEqual(error["error"]["code"], "VALIDATION_ERROR")
            finally:
                server.shutdown()
                server.server_close()
                server_thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
