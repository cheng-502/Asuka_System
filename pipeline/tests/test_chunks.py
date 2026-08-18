from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.chunks import ChunkingConfig, approximate_token_count, chunk_note
from auaka_pipeline.markdown import parse_markdown


class ChunkingTest(unittest.TestCase):
    def test_chunks_keep_heading_context_offsets_and_hashes(self) -> None:
        source = "# 视觉\n\n目标检测用于识别目标。\n\n## 数据集\n\n训练数据需要清洗。"
        note = parse_markdown(source, "vision.md", content_hash="note-hash")

        chunks = chunk_note(note, ChunkingConfig(max_tokens=40, overlap_tokens=5))

        self.assertGreaterEqual(len(chunks), 2)
        self.assertEqual(chunks[0].note_id, "vision.md")
        self.assertEqual(chunks[0].title, "视觉")
        self.assertEqual(chunks[0].heading_path, ("视觉",))
        self.assertEqual(chunks[1].heading_path, ("视觉", "数据集"))
        for chunk in chunks:
            self.assertEqual(note.source_text[chunk.start_offset : chunk.end_offset], chunk.content)
            self.assertEqual(len(chunk.content_hash), 64)
            self.assertTrue(chunk.chunk_id.startswith("vision.md::"))

    def test_long_content_is_split_with_stable_ids_and_approximate_overlap(self) -> None:
        source = "# Notes\n\n" + " ".join(f"sentence-{index}." for index in range(80))
        note = parse_markdown(source, "notes.md", content_hash="note-hash")

        config = ChunkingConfig(max_tokens=20, overlap_tokens=4)
        first = chunk_note(note, config)
        second = chunk_note(note, config)

        self.assertGreater(len(first), 2)
        self.assertEqual([item.chunk_id for item in first], [item.chunk_id for item in second])
        self.assertTrue(any(set(first[index].content.split()) & set(first[index + 1].content.split()) for index in range(len(first) - 1)))

    def test_unpunctuated_long_content_uses_a_hard_boundary_fallback(self) -> None:
        source = "# Notes\n\n" + ("longword " * 80)
        note = parse_markdown(source, "notes.md", content_hash="note-hash")

        chunks = chunk_note(note, ChunkingConfig(max_tokens=20, overlap_tokens=4))

        self.assertGreater(len(chunks), 2)
        self.assertTrue(
            all(approximate_token_count(chunk.content) <= 20 for chunk in chunks)
        )


if __name__ == "__main__":
    unittest.main()
