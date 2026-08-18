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


if __name__ == "__main__":
    unittest.main()
