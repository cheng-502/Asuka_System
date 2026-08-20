from __future__ import annotations

import json
import math
import random
import sys
import unittest
from dataclasses import asdict
from pathlib import Path

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.galaxy_layout import GalaxyLayoutConfig, generate_galaxy_layouts  # noqa: E402
from auaka_pipeline.hierarchy import HierarchyRecord, UNASSIGNED_HUB_ID  # noqa: E402


def record(
    note_id: str,
    *,
    role: str = "note",
    parent: str | None = None,
    depth: int = 0,
    root: str | None = None,
    assignment: str = "explicit",
) -> HierarchyRecord:
    return HierarchyRecord(
        note_id=note_id,
        role=role,  # type: ignore[arg-type]
        parent_id=parent,
        depth=depth,
        assignment=assignment,  # type: ignore[arg-type]
        topic_root_id=root or note_id,
    )


class GalaxyLayoutTest(unittest.TestCase):
    def test_single_root_is_centered_and_nested_hubs_expand_outward(self) -> None:
        records = [
            record("root.md", role="hub"),
            record("child.md", role="hub", parent="root.md", depth=1, root="root.md"),
            record("leaf.md", parent="child.md", depth=2, root="root.md"),
        ]
        semantic = np.asarray([[0, 0, 0], [1, 0, 0], [1, 1, 0]], dtype=np.float32)

        result = generate_galaxy_layouts(records, ("root.md", "child.md", "leaf.md"), semantic)

        self.assertEqual(result.galaxy["root.md"], (0.0, 0.0, 0.0))
        self.assertGreater(_norm(result.galaxy["child.md"]), 0.0)
        self.assertGreater(_distance(result.galaxy["leaf.md"], result.galaxy["child.md"]), 0.0)
        self.assertTrue(all(math.isfinite(value) for point in result.galaxy.values() for value in point))

    def test_layout_is_byte_stable_when_inputs_are_shuffled(self) -> None:
        records = [
            record("a.md", role="hub"),
            record("b.md", role="hub"),
            record("a-1.md", parent="a.md", depth=1, root="a.md", assignment="semantic"),
            record("b-1.md", parent="b.md", depth=1, root="b.md", assignment="folder"),
        ]
        note_ids = ("a.md", "b.md", "a-1.md", "b-1.md")
        semantic = np.asarray([[0, 0, 0], [2, 0, 0], [0.2, 1, 0], [1.8, -1, 0]], dtype=np.float32)
        expected = generate_galaxy_layouts(records, note_ids, semantic)

        order = list(range(4))
        random.Random(42).shuffle(order)
        actual = generate_galaxy_layouts(
            [records[index] for index in order],
            tuple(note_ids[index] for index in order),
            semantic[order],
        )

        self.assertEqual(_serialized(actual), _serialized(expected))

    def test_compact_uses_inner_hub_and_outer_note_shells(self) -> None:
        records = [record("hub.md", role="hub")]
        records.extend(
            record(f"note-{index:03d}.md", parent="hub.md", depth=1, root="hub.md", assignment="folder")
            for index in range(20)
        )
        note_ids = tuple(item.note_id for item in records)
        semantic = np.zeros((len(records), 3), dtype=np.float32)

        result = generate_galaxy_layouts(records, note_ids, semantic)

        hub_radius = _norm(result.compact["hub.md"])
        note_radii = [_norm(result.compact[note_id]) for note_id in note_ids[1:]]
        self.assertLess(hub_radius, min(note_radii))
        self.assertGreater(len({tuple(round(value, 6) for value in result.compact[note_id]) for note_id in note_ids}), 15)

    def test_unassigned_virtual_hub_is_emitted_and_large_deep_inputs_stay_bounded(self) -> None:
        records = [record("hub-0000.md", role="hub")]
        records.extend(
            record(
                f"hub-{index:04d}.md",
                role="hub",
                parent=f"hub-{index - 1:04d}.md",
                depth=index,
                root="hub-0000.md",
            )
            for index in range(1, 1100)
        )
        records.append(
            record(
                "orphan.md",
                parent=UNASSIGNED_HUB_ID,
                depth=1,
                root=UNASSIGNED_HUB_ID,
                assignment="unassigned",
            )
        )
        note_ids = tuple(item.note_id for item in records)
        semantic = np.zeros((len(records), 3), dtype=np.float32)

        result = generate_galaxy_layouts(records, note_ids, semantic, GalaxyLayoutConfig(seed=42))

        self.assertIn(UNASSIGNED_HUB_ID, result.galaxy)
        self.assertIn(UNASSIGNED_HUB_ID, result.compact)
        self.assertLess(max(_norm(point) for point in result.galaxy.values()), 100.0)
        deep_hub_positions = [result.galaxy[f"hub-{index:04d}.md"] for index in range(1100)]
        self.assertEqual(len(set(deep_hub_positions)), len(deep_hub_positions))
        self.assertTrue(all(math.isfinite(value) for point in result.compact.values() for value in point))

    def test_rejects_nonfinite_or_misaligned_semantic_positions(self) -> None:
        records = [record("hub.md", role="hub")]
        with self.assertRaisesRegex(ValueError, "same note IDs"):
            generate_galaxy_layouts(records, ("other.md",), np.zeros((1, 3)))
        with self.assertRaisesRegex(ValueError, "finite"):
            generate_galaxy_layouts(records, ("hub.md",), np.asarray([[np.nan, 0, 0]]))

    def test_rejects_invalid_hierarchy_instead_of_emitting_partial_layouts(self) -> None:
        cyclic = [
            record("a.md", role="hub", parent="b.md", depth=1, root="a.md"),
            record("b.md", role="hub", parent="a.md", depth=1, root="a.md"),
        ]
        with self.assertRaisesRegex(ValueError, "cycle|unreachable"):
            generate_galaxy_layouts(cyclic, ("a.md", "b.md"), np.zeros((2, 3)))

        wrong_depth = [
            record("hub.md", role="hub"),
            record("note.md", parent="hub.md", depth=4, root="hub.md", assignment="folder"),
        ]
        with self.assertRaisesRegex(ValueError, "depth"):
            generate_galaxy_layouts(wrong_depth, ("hub.md", "note.md"), np.zeros((2, 3)))

    def test_extreme_finite_semantics_are_scaled_safely(self) -> None:
        records = [
            record("hub.md", role="hub"),
            record("note.md", parent="hub.md", depth=1, root="hub.md", assignment="semantic"),
        ]
        semantic = np.asarray([[1e308, 1e308, 1e308], [-1e308, -1e308, -1e308]])
        before = semantic.copy()
        result = generate_galaxy_layouts(
            records,
            ("hub.md", "note.md"),
            semantic,
        )
        self.assertTrue(all(math.isfinite(value) for point in result.galaxy.values() for value in point))
        np.testing.assert_array_equal(semantic, before)

    def test_rejects_unassigned_note_attached_to_a_real_hub(self) -> None:
        records = [
            record("hub.md", role="hub"),
            record("note.md", parent="hub.md", depth=1, root="hub.md", assignment="unassigned"),
        ]
        with self.assertRaisesRegex(ValueError, "unassigned"):
            generate_galaxy_layouts(records, ("hub.md", "note.md"), np.zeros((2, 3)))


def _norm(point: tuple[float, float, float]) -> float:
    return math.sqrt(sum(value * value for value in point))


def _distance(first: tuple[float, float, float], second: tuple[float, float, float]) -> float:
    return _norm(tuple(a - b for a, b in zip(first, second)))


def _serialized(result: object) -> str:
    return json.dumps(asdict(result), sort_keys=True, separators=(",", ":"))  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
