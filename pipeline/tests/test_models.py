from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.models import ArtifactValidationError, validate_artifact


def valid_artifact() -> dict[str, object]:
    return {
        "version": 1,
        "generated_at": "2026-08-18T12:00:00Z",
        "pipeline": {"version": "mvp1.0.0"},
        "embedding": {
            "model": "BAAI/bge-m3",
            "dimension": 1024,
            "metric": "cosine",
            "normalized": True,
        },
        "umap": {"n_components": 3, "random_state": 42, "metric": "cosine"},
        "source": {"vault_hash": "a" * 64, "note_count": 2},
        "nodes": [
            {
                "id": "01/目标检测.md",
                "title": "目标检测",
                "summary": "Object detection notes.",
                "domain": "01",
                "position": {"x": 0.1, "y": -0.2, "z": 0.3},
                "explicit_link_count": 1,
            },
            {
                "id": "02/object-detection.md",
                "title": "object detection",
                "summary": "Cross-language concept.",
                "domain": "02",
                "position": {"x": -0.1, "y": 0.2, "z": -0.3},
                "explicit_link_count": 0,
            },
        ],
        "links": [
            {
                "source": "01/目标检测.md",
                "target": "02/object-detection.md",
                "types": ["wikilink", "semantic"],
                "similarity": 0.86,
                "is_unresolved": False,
            },
            {
                "source": "01/目标检测.md",
                "target": "missing-note",
                "types": ["wikilink"],
                "is_unresolved": True,
                "unresolved_target": "missing-note",
            },
        ],
    }


class ArtifactValidationTest(unittest.TestCase):
    def test_validates_shared_fixture(self) -> None:
        fixture_path = Path(__file__).parents[2] / "contracts" / "fixtures" / "knowledge-space.fixture.json"
        artifact = json.loads(fixture_path.read_text(encoding="utf-8"))

        validate_artifact(artifact)

    def test_accepts_valid_artifact_with_merged_and_unresolved_links(self) -> None:
        validate_artifact(valid_artifact())

    def test_allows_resolved_link_without_optional_unresolved_metadata(self) -> None:
        artifact = valid_artifact()
        artifact["links"][0].pop("is_unresolved")  # type: ignore[index]

        validate_artifact(artifact)

    def test_rejects_missing_required_metadata(self) -> None:
        artifact = valid_artifact()
        del artifact["embedding"]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_invalid_coordinates(self) -> None:
        artifact = valid_artifact()
        artifact["nodes"][0]["position"]["z"] = "not-a-number"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_unknown_resolved_relation_target(self) -> None:
        artifact = copy.deepcopy(valid_artifact())
        artifact["links"][0]["target"] = "not-a-node"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)


if __name__ == "__main__":
    unittest.main()
