from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.cli import main
from auaka_pipeline.config import RuntimeConfig


class CliTest(unittest.TestCase):
    def test_placeholder_cli_reports_mvp1_pipeline(self) -> None:
        output = io.StringIO()

        with redirect_stdout(output):
            exit_code = main([])

        self.assertEqual(exit_code, 0)
        self.assertIn("Auaka System Knowledge Pipeline", output.getvalue())

    def test_runtime_config_reads_paths_from_environment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AUAKA_VAULT_PATH": "C:/vault",
                "AUAKA_HAND_MODEL_PATH": "frontend/public/models/hand_landmarker.task",
                "AUAKA_EMBEDDING_MODEL": "fake-multilingual",
                "AUAKA_EMBEDDING_DIMENSION": "3",
                "AUAKA_EMBEDDING_DEVICE": "cpu",
                "AUAKA_MODEL_CACHE_PATH": "data/test-model-cache",
                "AUAKA_CHUNK_INDEX_PATH": "data/test-chunks",
            },
            clear=False,
        ):
            config = RuntimeConfig.from_env()

        self.assertEqual(config.vault_path, Path("C:/vault"))
        self.assertEqual(
            config.hand_model_path,
            Path("frontend/public/models/hand_landmarker.task"),
        )
        self.assertEqual(config.embedding_model, "fake-multilingual")
        self.assertEqual(config.embedding_dimension, 3)
        self.assertEqual(config.embedding_device, "cpu")
        self.assertEqual(config.embedding_cache_path, Path("data/test-model-cache"))
        self.assertEqual(config.chunk_index_path, Path("data/test-chunks"))
        self.assertEqual(config.embedding_config.metric, "cosine")

    def test_scan_command_prints_structured_read_only_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            vault = Path(temporary_dir)
            (vault / "note.md").write_text("# Note\n\nContent.", encoding="utf-8")
            output = io.StringIO()

            with redirect_stdout(output):
                exit_code = main(["scan", "--vault", str(vault)])

        report = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["included_count"], 1)
        self.assertEqual(report["excluded_count"], 0)
        self.assertEqual(report["unresolved_link_count"], 0)

    def test_scan_report_is_safe_for_non_utf8_console_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            vault = Path(temporary_dir)
            (vault / "emoji.md").write_text("# 知识 ⭐\n\nContent.", encoding="utf-8")
            output = io.StringIO()

            with redirect_stdout(output):
                main(["scan", "--vault", str(vault)])

        self.assertTrue(output.getvalue().isascii())

    def test_chunks_command_builds_an_incremental_index_report(self) -> None:
        import numpy as np

        class FakeEmbedder:
            dimension = 3
            runtime_device = "cpu"
            revision = "test-revision"

            def encode(self, texts: list[str], *, normalize_embeddings: bool) -> np.ndarray:
                del normalize_embeddings
                return np.asarray([[1.0, 0.0, 0.0] for _ in texts], dtype=np.float32)

        with tempfile.TemporaryDirectory() as temporary_dir:
            vault = Path(temporary_dir) / "vault"
            vault.mkdir()
            (vault / "note.md").write_text("# Note\n\nContent.", encoding="utf-8")
            cache = Path(temporary_dir) / "chunks"
            output = io.StringIO()

            with patch.dict(os.environ, {"AUAKA_EMBEDDING_DIMENSION": "3"}, clear=False):
                with patch("auaka_pipeline.cli.load_sentence_transformer_embedder", return_value=FakeEmbedder()):
                    with redirect_stdout(output):
                        exit_code = main(["chunks", "--vault", str(vault), "--cache", str(cache)])
            cache_exists = (cache / "chunk-index.json").exists()

        report = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["total_count"], 1)
        self.assertEqual(report["encoded_count"], 1)
        self.assertTrue(cache_exists)

    def test_generate_defaults_to_thresholded_links_and_requires_explicit_calibration(self) -> None:
        generated = {
            "note_count": 0,
            "hierarchy": {"assignment_counts": {}, "warnings": []},
        }
        output = io.StringIO()
        with patch("auaka_pipeline.cli.generate_from_vault", return_value=generated) as generate:
            with redirect_stdout(output):
                self.assertEqual(main(["generate", "--vault", "C:/vault"]), 0)
            self.assertEqual(generate.call_args.kwargs["min_similarity"], 0.60)
            self.assertEqual(generate.call_args.kwargs["hierarchy_min_similarity"], 0.60)

            with redirect_stdout(io.StringIO()):
                self.assertEqual(
                    main(["generate", "--vault", "C:/vault", "--calibrate-similarity"]),
                    0,
                )
            self.assertIsNone(generate.call_args.kwargs["min_similarity"])


if __name__ == "__main__":
    unittest.main()
