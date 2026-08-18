from __future__ import annotations

import io
import os
import sys
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
            },
            clear=False,
        ):
            config = RuntimeConfig.from_env()

        self.assertEqual(config.vault_path, Path("C:/vault"))
        self.assertEqual(
            config.hand_model_path,
            Path("frontend/public/models/hand_landmarker.task"),
        )


if __name__ == "__main__":
    unittest.main()
