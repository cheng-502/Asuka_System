from __future__ import annotations

import json
import inspect
import sys
import tomllib
import unittest
from pathlib import Path


PIPELINE_ROOT = Path(__file__).parents[1]
REPOSITORY_ROOT = PIPELINE_ROOT.parent
sys.path.insert(0, str(PIPELINE_ROOT / "src"))

from auaka_pipeline import __version__  # noqa: E402
from auaka_pipeline.generate import generate_from_vault  # noqa: E402


class ReleaseVersionTest(unittest.TestCase):
    def test_release_versions_are_consistent(self) -> None:
        project = tomllib.loads((PIPELINE_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        fixture = json.loads(
            (REPOSITORY_ROOT / "contracts/fixtures/knowledge-space-v2.fixture.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(__version__, project["project"]["version"])
        pipeline_default = inspect.signature(generate_from_vault).parameters["pipeline_version"].default
        self.assertEqual(pipeline_default, f"mvp{__version__}")
        self.assertEqual(fixture["pipeline"]["version"], f"mvp{__version__}")


if __name__ == "__main__":
    unittest.main()
