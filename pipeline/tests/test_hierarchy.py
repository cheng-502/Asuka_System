from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.hierarchy import HierarchyConfig, resolve_hierarchy  # noqa: E402
from auaka_pipeline.markdown import ParsedNote, WikilinkReference  # noqa: E402
from auaka_pipeline.relationships import (  # noqa: E402
    RelationRecord,
    RelationshipResult,
)


def note(
    note_id: str,
    *,
    hub: bool = False,
    parent: str | None = None,
    links: tuple[str, ...] = (),
) -> ParsedNote:
    return ParsedNote(
        note_id=note_id,
        title=Path(note_id).stem,
        summary="summary",
        domain=Path(note_id).parts[0] if len(Path(note_id).parts) > 1 else "root",
        wikilinks=tuple(
            WikilinkReference(raw_target=target, resolved_target_id=target)
            for target in links
        ),
        content_hash=f"hash-{note_id}",
        knowledge_role="hub" if hub else None,
        knowledge_parent=(WikilinkReference(raw_target=parent) if parent else None),
        knowledge_role_raw="hub" if hub else None,
        knowledge_parent_raw=f"[[{parent}]]" if parent else None,
    )


def relationships(*links: RelationRecord) -> RelationshipResult:
    return RelationshipResult(links=links, distribution={})


class HierarchyResolutionTest(unittest.TestCase):
    def test_resolves_explicit_multilevel_hubs_and_note_parent(self) -> None:
        result = resolve_hierarchy(
            [
                note("Topics/root.md", hub=True),
                note("Topics/vision.md", hub=True, parent="Topics/root"),
                note("Topics/cameras.md", hub=True, parent="vision"),
                note("Topics/calibration.md", parent="cameras"),
            ],
            relationships(),
        )

        records = result.by_id()
        self.assertEqual((records["Topics/root.md"].parent_id, records["Topics/root.md"].depth), (None, 0))
        self.assertEqual((records["Topics/vision.md"].parent_id, records["Topics/vision.md"].depth), ("Topics/root.md", 1))
        self.assertEqual((records["Topics/cameras.md"].parent_id, records["Topics/cameras.md"].depth), ("Topics/vision.md", 2))
        self.assertEqual(records["Topics/calibration.md"].parent_id, "Topics/cameras.md")
        self.assertEqual(records["Topics/calibration.md"].depth, 3)
        self.assertEqual(records["Topics/calibration.md"].topic_root_id, "Topics/root.md")
        self.assertTrue(all(record.assignment == "explicit" for record in records.values()))

    def test_applies_fallback_precedence_and_never_forces_weak_semantics(self) -> None:
        notes = [
            note("Vision/root.md", hub=True),
            note("Vision/Sub/near.md", hub=True),
            note("Other/other.md", hub=True),
            note("Vision/Sub/explicit.md", parent="Other/other", links=("Vision/root.md",)),
            note("Vision/Sub/linked.md", links=("Vision/root.md", "Vision/Sub/near.md")),
            note("Vision/Sub/folder.md"),
            note("Loose/semantic.md"),
            note("Loose/isolated.md"),
        ]
        relations = relationships(
            RelationRecord("Vision/Sub/linked.md", "Vision/root.md", ("wikilink", "semantic"), 0.81),
            RelationRecord("Vision/Sub/linked.md", "Vision/Sub/near.md", ("wikilink", "semantic"), 0.92),
            RelationRecord("Loose/semantic.md", "Other/other.md", ("semantic",), 0.74),
            RelationRecord("Loose/isolated.md", "Other/other.md", ("semantic",), 0.59),
        )

        records = resolve_hierarchy(notes, relations, HierarchyConfig(min_semantic_similarity=0.60)).by_id()

        self.assertEqual((records["Vision/Sub/explicit.md"].parent_id, records["Vision/Sub/explicit.md"].assignment), ("Other/other.md", "explicit"))
        self.assertEqual((records["Vision/Sub/linked.md"].parent_id, records["Vision/Sub/linked.md"].assignment), ("Vision/Sub/near.md", "wikilink"))
        self.assertEqual((records["Vision/Sub/folder.md"].parent_id, records["Vision/Sub/folder.md"].assignment), ("Vision/Sub/near.md", "folder"))
        self.assertEqual((records["Loose/semantic.md"].parent_id, records["Loose/semantic.md"].assignment), ("Other/other.md", "semantic"))
        self.assertEqual((records["Loose/isolated.md"].parent_id, records["Loose/isolated.md"].assignment), ("virtual:unassigned", "unassigned"))

    def test_cross_subtree_wikilink_is_ignored_and_hubs_are_not_auto_nested(self) -> None:
        notes = [
            note("A/hub.md", hub=True, links=("A/child-hub.md",)),
            note("A/child-hub.md", hub=True),
            note("A/note.md", links=("B/hub.md",)),
            note("B/hub.md", hub=True),
        ]

        records = resolve_hierarchy(notes, relationships()).by_id()

        self.assertIsNone(records["A/hub.md"].parent_id)
        self.assertIsNone(records["A/child-hub.md"].parent_id)
        self.assertEqual(records["A/note.md"].parent_id, "A/child-hub.md")
        self.assertEqual(records["A/note.md"].assignment, "folder")

    def test_invalid_parent_and_cycles_warn_then_hubs_become_roots(self) -> None:
        notes = [
            note("a.md", hub=True, parent="b"),
            note("b.md", hub=True, parent="a"),
            note("c.md", hub=True, parent="missing"),
            note("ordinary.md", parent="c"),
        ]

        result = resolve_hierarchy(notes, relationships())
        records = result.by_id()

        self.assertIsNone(records["a.md"].parent_id)
        self.assertIsNone(records["b.md"].parent_id)
        self.assertIsNone(records["c.md"].parent_id)
        self.assertEqual(records["ordinary.md"].parent_id, "c.md")
        self.assertEqual(
            [(warning.note_id, warning.code) for warning in result.warnings],
            [("a.md", "parent_cycle"), ("b.md", "parent_cycle"), ("c.md", "unresolved_parent")],
        )

    def test_output_is_input_order_independent_and_deep_chains_are_iterative(self) -> None:
        notes = [note("hub-0000.md", hub=True)]
        notes.extend(
            note(f"hub-{index:04d}.md", hub=True, parent=f"hub-{index - 1:04d}")
            for index in range(1, 1100)
        )
        expected = resolve_hierarchy(notes, relationships())
        shuffled = list(notes)
        random.Random(42).shuffle(shuffled)
        actual = resolve_hierarchy(shuffled, relationships())

        self.assertEqual(actual.records, expected.records)
        self.assertEqual(actual.records[-1].depth, 1099)
        self.assertEqual(actual.records[-1].topic_root_id, "hub-0000.md")

    def test_rejects_casefold_colliding_note_ids_in_any_input_order(self) -> None:
        colliding = [note("A.md", hub=True), note("a.MD", hub=True)]

        with self.assertRaisesRegex(ValueError, "case-insensitive"):
            resolve_hierarchy(colliding, relationships())
        with self.assertRaisesRegex(ValueError, "case-insensitive"):
            resolve_hierarchy(list(reversed(colliding)), relationships())


if __name__ == "__main__":
    unittest.main()
