from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.embeddings import EmbeddingBatch  # noqa: E402
from auaka_pipeline.markdown import ParsedNote, WikilinkReference  # noqa: E402
from auaka_pipeline.relationships import (  # noqa: E402
    RelationshipConfig,
    build_relationships,
)


def note(
    note_id: str,
    links: tuple[WikilinkReference, ...] = (),
) -> ParsedNote:
    return ParsedNote(
        note_id=note_id,
        title=Path(note_id).stem,
        summary="summary",
        domain="root",
        wikilinks=links,
        content_hash=f"hash-{note_id}",
    )


def resolved(target: str) -> WikilinkReference:
    return WikilinkReference(
        raw_target=target,
        resolved_target_id=target,
    )


def unresolved(target: str) -> WikilinkReference:
    return WikilinkReference(raw_target=target)


def batch(note_ids: tuple[str, ...], vectors: list[list[float]]) -> EmbeddingBatch:
    return EmbeddingBatch(
        note_ids=note_ids,
        content_hashes=tuple(f"hash-{note_id}" for note_id in note_ids),
        vectors=np.asarray(vectors, dtype=np.float32),
        metadata={"model": "fake", "dimension": len(vectors[0]), "normalized": True},
    )


class RelationshipTest(unittest.TestCase):
    def test_merges_reverse_explicit_links_with_semantic_link(self) -> None:
        notes = [
            note("a.md", (resolved("b.md"),)),
            note("b.md", (resolved("a.md"),)),
            note("c.md", (resolved("c.md"),)),
        ]
        embeddings = batch(
            ("a.md", "b.md", "c.md"),
            [[1.0, 0.0, 0.0], [0.98, 0.2, 0.0], [0.0, 0.0, 1.0]],
        )

        result = build_relationships(
            notes,
            embeddings,
            RelationshipConfig(max_neighbors=2, min_similarity=0.9),
        )

        self.assertEqual(len(result.links), 2)
        link = next(link for link in result.links if link.source == "a.md")
        self.assertEqual((link.source, link.target), ("a.md", "b.md"))
        self.assertEqual(link.types, ("wikilink", "semantic"))
        self.assertAlmostEqual(link.similarity or 0.0, 0.9798, places=3)
        self_link = next(link for link in result.links if link.source == "c.md")
        self.assertEqual((self_link.source, self_link.target), ("c.md", "c.md"))
        self.assertEqual(self_link.types, ("wikilink",))
        self.assertEqual(result.distribution["count"], 3)
        self.assertGreater(result.distribution["max"], result.distribution["min"])

    def test_preserves_unresolved_wikilink_and_deduplicates_it(self) -> None:
        notes = [
            note("source.md", (unresolved("Missing"), unresolved("Missing"))),
            note("target.md"),
        ]
        embeddings = batch(("source.md", "target.md"), [[1.0, 0.0], [0.0, 1.0]])

        result = build_relationships(
            notes,
            embeddings,
            RelationshipConfig(max_neighbors=1, min_similarity=0.95),
        )

        self.assertEqual(len(result.links), 1)
        link = result.links[0]
        self.assertEqual(link.types, ("wikilink",))
        self.assertTrue(link.is_unresolved)
        self.assertEqual(link.target, "Missing")
        self.assertEqual(link.unresolved_target, "Missing")

    def test_top_k_and_threshold_do_not_force_links_for_an_isolated_note(self) -> None:
        notes = [note("a.md"), note("b.md"), note("isolated.md")]
        embeddings = batch(
            ("a.md", "b.md", "isolated.md"),
            [[1.0, 0.0, 0.0], [0.8, 0.6, 0.0], [0.0, 0.0, 1.0]],
        )

        result = build_relationships(
            notes,
            embeddings,
            RelationshipConfig(max_neighbors=1, min_similarity=0.7),
        )

        self.assertEqual([(link.source, link.target) for link in result.links], [("a.md", "b.md")])
        self.assertEqual(result.distribution["count"], 3)
        self.assertEqual(result.distribution["threshold"], 0.7)


if __name__ == "__main__":
    unittest.main()
