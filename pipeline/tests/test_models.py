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


def valid_v2_artifact() -> dict[str, object]:
    fixture_path = Path(__file__).parents[2] / "contracts" / "fixtures" / "knowledge-space-v2.fixture.json"
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def invalid_fixture_cases() -> list[dict[str, object]]:
    fixture_path = Path(__file__).parents[2] / "contracts" / "fixtures" / "knowledge-space-invalid-cases.fixture.json"
    corpus = json.loads(fixture_path.read_text(encoding="utf-8"))
    return corpus["cases"]


def apply_fixture_mutations(artifact: dict[str, object], mutations: list[dict[str, object]]) -> None:
    for mutation in mutations:
        path = mutation["path"]
        target: object = artifact
        for segment in path[:-1]:  # type: ignore[index]
            target = target[segment]  # type: ignore[index]
        key = path[-1]  # type: ignore[index]
        if mutation["operation"] == "delete":
            del target[key]  # type: ignore[index]
        else:
            target[key] = mutation["value"]  # type: ignore[index]


class ArtifactValidationTest(unittest.TestCase):
    def test_validates_shared_fixture(self) -> None:
        fixture_path = Path(__file__).parents[2] / "contracts" / "fixtures" / "knowledge-space.fixture.json"
        artifact = json.loads(fixture_path.read_text(encoding="utf-8"))

        validate_artifact(artifact)

    def test_accepts_valid_artifact_with_merged_and_unresolved_links(self) -> None:
        validate_artifact(valid_artifact())

    def test_accepts_strict_v2_shared_fixture(self) -> None:
        validate_artifact(valid_v2_artifact())

    def test_rejects_every_case_in_shared_invalid_fixture_corpus(self) -> None:
        for case in invalid_fixture_cases():
            with self.subTest(case=case["name"]):
                artifact = valid_artifact() if case["base_artifact"] == "v1" else valid_v2_artifact()
                apply_fixture_mutations(artifact, case["mutations"])  # type: ignore[arg-type]
                with self.assertRaises(ArtifactValidationError):
                    validate_artifact(artifact)

    def test_rejects_unknown_artifact_version(self) -> None:
        artifact = valid_v2_artifact()
        artifact["version"] = 3

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_v2_node_missing_layout(self) -> None:
        artifact = valid_v2_artifact()
        del artifact["nodes"][0]["layouts"]["compact"]  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_real_and_virtual_id_collision(self) -> None:
        artifact = valid_v2_artifact()
        artifact["virtual_nodes"][0]["id"] = "topics/vision.md"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_parent_that_is_an_ordinary_note(self) -> None:
        artifact = valid_v2_artifact()
        hierarchy = artifact["nodes"][1]["hierarchy"]  # type: ignore[index]
        hierarchy["parent_id"] = "notes/yolo.md"
        hierarchy["depth"] = 3

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_non_explicit_hub_assignment(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][0]["hierarchy"]["assignment"] = "folder"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_automatic_assignment_for_child_hub(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][1]["hierarchy"]["assignment"] = "semantic"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_non_unassigned_note_beneath_virtual_hub(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][3]["hierarchy"]["assignment"] = "semantic"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_inconsistent_hierarchy_depth(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][2]["hierarchy"]["depth"] = 7  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_parent_cycle(self) -> None:
        artifact = valid_v2_artifact()
        first = artifact["nodes"][0]["hierarchy"]  # type: ignore[index]
        first["parent_id"] = "topics/detection.md"
        first["depth"] = 2

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_non_finite_layout_coordinate(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][0]["layouts"]["galaxy"]["x"] = float("nan")  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_source_note_count_mismatch(self) -> None:
        artifact = valid_v2_artifact()
        artifact["source"]["note_count"] = 99  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_knowledge_link_to_virtual_node(self) -> None:
        artifact = valid_v2_artifact()
        artifact["links"][0]["target"] = "virtual:unassigned"  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_unresolved_knowledge_link_to_virtual_namespace(self) -> None:
        artifact = valid_v2_artifact()
        link = artifact["links"][0]  # type: ignore[index]
        link["target"] = "virtual:unassigned"
        link["is_unresolved"] = True
        link["unresolved_target"] = "virtual:unassigned"

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_rejects_coordinate_that_overflows_float_conversion(self) -> None:
        artifact = valid_v2_artifact()
        artifact["nodes"][0]["layouts"]["compact"]["x"] = 10**400  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(artifact)

    def test_keeps_v1_and_v2_node_shapes_mutually_exclusive(self) -> None:
        v1 = valid_artifact()
        v1["nodes"][0]["hierarchy"] = {  # type: ignore[index]
            "role": "hub",
            "parent_id": None,
            "depth": 0,
            "assignment": "explicit",
            "topic_root_id": "01/目标检测.md",
        }
        v2 = valid_v2_artifact()
        v2["nodes"][0]["position"] = {"x": 0, "y": 0, "z": 0}  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(v1)
        with self.assertRaises(ArtifactValidationError):
            validate_artifact(v2)

    def test_rejects_v1_note_count_mismatch_and_non_finite_coordinate(self) -> None:
        mismatched = valid_artifact()
        mismatched["source"]["note_count"] = 99  # type: ignore[index]
        non_finite = valid_artifact()
        non_finite["nodes"][0]["position"]["x"] = float("inf")  # type: ignore[index]

        with self.assertRaises(ArtifactValidationError):
            validate_artifact(mismatched)
        with self.assertRaises(ArtifactValidationError):
            validate_artifact(non_finite)

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
