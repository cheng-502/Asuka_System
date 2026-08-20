from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.artifact import build_artifact, write_artifact_atomic  # noqa: E402
from auaka_pipeline.embeddings import EmbeddingBatch  # noqa: E402
from auaka_pipeline.hashing import hash_notes  # noqa: E402
from auaka_pipeline.hierarchy import resolve_hierarchy  # noqa: E402
from auaka_pipeline.galaxy_layout import generate_galaxy_layouts  # noqa: E402
from auaka_pipeline.markdown import ParsedNote, WikilinkReference  # noqa: E402
from auaka_pipeline.models import ArtifactValidationError, validate_artifact  # noqa: E402
from auaka_pipeline.relationships import RelationshipConfig, build_relationships  # noqa: E402


def note(
    note_id: str,
    links: tuple[WikilinkReference, ...] = (),
    *,
    hub: bool = False,
) -> ParsedNote:
    return ParsedNote(
        note_id=note_id,
        title=Path(note_id).stem,
        summary=f"Summary for {note_id}",
        domain="root",
        wikilinks=links,
        content_hash=f"content-{note_id}",
        knowledge_role="hub" if hub else None,
        knowledge_role_raw="hub" if hub else None,
    )


class ArtifactTest(unittest.TestCase):
    def test_hash_changes_for_included_path_or_content(self) -> None:
        original = [note("a.md")]
        changed_path = [note("renamed.md")]
        changed_content = [
            ParsedNote(
                note_id="a.md",
                title="a",
                summary="changed",
                domain="root",
                wikilinks=(),
                content_hash="different-content",
            )
        ]

        self.assertNotEqual(hash_notes(original), hash_notes(changed_path))
        self.assertNotEqual(hash_notes(original), hash_notes(changed_content))

    def test_builds_valid_versioned_artifact_with_metadata_and_links(self) -> None:
        notes = [note("a.md", (WikilinkReference("b.md", resolved_target_id="b.md"),), hub=True), note("b.md")]
        embeddings = EmbeddingBatch(
            note_ids=("a.md", "b.md"),
            content_hashes=("content-a.md", "content-b.md"),
            vectors=np.asarray([[1.0, 0.0], [0.9, 0.1]], dtype=np.float32),
            metadata={
                "model": "fake",
                "dimension": 2,
                "metric": "cosine",
                "normalized": True,
                "runtime_device": "cpu",
                "revision": "test-revision",
            },
        )
        relations = build_relationships(
            notes,
            embeddings,
            RelationshipConfig(max_neighbors=1, min_similarity=0.5),
        )
        positions = np.asarray([[0.1, 0.2, 0.3], [-0.1, -0.2, -0.3]], dtype=np.float32)
        hierarchy = resolve_hierarchy(notes, relations)
        layouts = generate_galaxy_layouts(hierarchy.records, embeddings.note_ids, positions)

        artifact = build_artifact(
            notes,
            embeddings,
            relations,
            positions,
            hierarchy=hierarchy,
            layouts=layouts,
            vault_hash=hash_notes(notes),
            pipeline_version="mvp1.0.0",
            umap_metadata={"n_components": 3, "random_state": 42, "metric": "cosine"},
        )

        validate_artifact(artifact)
        self.assertEqual(artifact["version"], 2)
        self.assertEqual(artifact["source"]["note_count"], 2)
        self.assertEqual(artifact["embedding"]["runtime_device"], "cpu")
        self.assertEqual(artifact["embedding"]["revision"], "test-revision")
        self.assertEqual(artifact["nodes"][0]["explicit_link_count"], 1)
        self.assertNotIn("position", artifact["nodes"][0])
        self.assertAlmostEqual(artifact["nodes"][0]["layouts"]["semantic"]["x"], 0.1)
        self.assertEqual(artifact["nodes"][0]["hierarchy"]["role"], "hub")
        self.assertEqual(artifact["layout_generation"]["version"], "galaxy-layout-v1")
        self.assertEqual(
            artifact["relationships"],
            {"max_neighbors": 1, "min_similarity": 0.5, "hierarchy_min_similarity": 0.6},
        )
        self.assertEqual(artifact["virtual_nodes"], [])

        repeated = build_artifact(
            notes,
            embeddings,
            relations,
            positions,
            hierarchy=hierarchy,
            layouts=layouts,
            vault_hash=hash_notes(notes),
            pipeline_version="mvp1.0.0",
            umap_metadata={"n_components": 3, "random_state": 42, "metric": "cosine"},
        )
        first_stable = copy.deepcopy(artifact)
        repeated_stable = copy.deepcopy(repeated)
        first_stable.pop("generated_at")
        repeated_stable.pop("generated_at")
        self.assertEqual(first_stable, repeated_stable)

    def test_failed_validation_does_not_replace_last_valid_artifact(self) -> None:
        notes = [note("a.md")]
        embeddings = EmbeddingBatch(
            note_ids=("a.md",),
            content_hashes=("content-a.md",),
            vectors=np.asarray([[1.0, 0.0]], dtype=np.float32),
            metadata={"model": "fake", "dimension": 2, "metric": "cosine", "normalized": True},
        )
        relations = build_relationships(notes, embeddings, RelationshipConfig())
        positions = np.asarray([[0.0, 0.0, 0.0]], dtype=np.float32)
        hierarchy = resolve_hierarchy(notes, relations)
        layouts = generate_galaxy_layouts(hierarchy.records, embeddings.note_ids, positions)
        valid = build_artifact(
            notes,
            embeddings,
            relations,
            positions,
            hierarchy=hierarchy,
            layouts=layouts,
            vault_hash=hash_notes(notes),
            pipeline_version="mvp1.0.0",
            umap_metadata={"n_components": 3, "random_state": 42, "metric": "cosine"},
        )

        with tempfile.TemporaryDirectory() as temporary_dir:
            target = Path(temporary_dir) / "knowledge-space.json"
            write_artifact_atomic(valid, target)
            before = target.read_text(encoding="utf-8")
            invalid = copy.deepcopy(valid)
            invalid["source"]["vault_hash"] = "not-a-hash"  # type: ignore[index]

            with self.assertRaises(ArtifactValidationError):
                write_artifact_atomic(invalid, target)

            self.assertEqual(target.read_text(encoding="utf-8"), before)
            json.loads(before)

            nonfinite = copy.deepcopy(valid)
            nonfinite["relationships"]["hierarchy_min_similarity"] = float("nan")  # type: ignore[index]
            with self.assertRaises(ArtifactValidationError):
                write_artifact_atomic(nonfinite, target)
            self.assertEqual(target.read_text(encoding="utf-8"), before)

    def test_unassigned_notes_emit_one_virtual_hub(self) -> None:
        notes = [note("orphan.md")]
        embeddings = EmbeddingBatch(
            note_ids=("orphan.md",),
            content_hashes=("content-orphan.md",),
            vectors=np.asarray([[1.0, 0.0]], dtype=np.float32),
            metadata={"model": "fake", "dimension": 2, "metric": "cosine", "normalized": True},
        )
        relations = build_relationships(notes, embeddings, RelationshipConfig())
        semantic = np.zeros((1, 3), dtype=np.float32)
        hierarchy = resolve_hierarchy(notes, relations)
        layouts = generate_galaxy_layouts(hierarchy.records, embeddings.note_ids, semantic)

        artifact = build_artifact(
            notes,
            embeddings,
            relations,
            semantic,
            hierarchy=hierarchy,
            layouts=layouts,
            vault_hash=hash_notes(notes),
            pipeline_version="mvp1.5.0",
            umap_metadata={"n_components": 3, "random_state": 42, "metric": "cosine"},
        )

        self.assertEqual([node["id"] for node in artifact["virtual_nodes"]], ["virtual:unassigned"])
        self.assertEqual(artifact["nodes"][0]["hierarchy"]["parent_id"], "virtual:unassigned")


if __name__ == "__main__":
    unittest.main()
