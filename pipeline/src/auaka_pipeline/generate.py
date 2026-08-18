"""End-to-end offline generation of the versioned knowledge-space artifact."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .artifact import DEFAULT_ARTIFACT_PATH, build_artifact, write_artifact_atomic
from .cache import save_embedding_cache
from .config import RuntimeConfig
from .embeddings import embed_notes, load_sentence_transformer_embedder
from .hashing import hash_notes
from .projection import UmapConfig, project_embeddings
from .relationships import RelationshipConfig, build_relationships
from .vault import scan_vault


def generate_from_vault(
    *,
    vault_path: Path,
    artifact_path: Path = DEFAULT_ARTIFACT_PATH,
    embedding_cache_path: Path = Path("data/embeddings"),
    runtime_config: RuntimeConfig | None = None,
    max_neighbors: int = 5,
    min_similarity: float | None = None,
    pipeline_version: str = "mvp1.0.0",
) -> dict[str, Any]:
    """Run scan → embed → cache → relations → UMAP → validated artifact."""

    config = runtime_config or RuntimeConfig.from_env()
    report = scan_vault(vault_path)
    if report.errors:
        messages = "; ".join(f"{error.relative_path}: {error.message}" for error in report.errors)
        raise RuntimeError(f"Vault scan encountered read errors: {messages}")

    embedder = load_sentence_transformer_embedder(config.embedding_config)
    embeddings = embed_notes(report.notes, embedder, config.embedding_config)
    save_embedding_cache(embeddings, embedding_cache_path)

    relationships = build_relationships(
        report.notes,
        embeddings,
        RelationshipConfig(max_neighbors=max_neighbors, min_similarity=min_similarity),
    )
    umap_config = UmapConfig()
    positions = project_embeddings(embeddings, umap_config)
    artifact = build_artifact(
        report.notes,
        embeddings,
        relationships,
        positions,
        vault_hash=hash_notes(report.notes),
        pipeline_version=pipeline_version,
        umap_metadata=umap_config.artifact_metadata(),
    )
    write_artifact_atomic(artifact, artifact_path)
    return {
        "vault": str(report.root),
        "artifact": str(artifact_path),
        "embedding_cache": str(embedding_cache_path),
        "note_count": len(report.notes),
        "link_count": len(artifact["links"]),
        "unresolved_link_count": len(report.unresolved_links),
        "embedding": artifact["embedding"],
        "umap": artifact["umap"],
        "source": artifact["source"],
        "similarity_distribution": relationships.distribution,
    }
