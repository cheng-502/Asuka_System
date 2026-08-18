# MVP-2A Chunk Retrieval Design

## Goal

Add a local, deterministic retrieval path for the personal knowledge space. The browser visualization remains powered by note-level embeddings and persisted UMAP coordinates; retrieval uses independent chunk-level high-dimensional embeddings.

## Scope

```text
Obsidian Markdown
  → Markdown-aware chunks
  → multilingual chunk embeddings
  → local exact cosine index
  → POST /search
```

MVP-2A does not add voice, LLM generation, RAG answer synthesis, Agent actions, or Vault writes.

## Chunk contract

Each chunk stores:

- `chunk_id`: deterministic note ID + heading path + ordinal.
- `note_id`: the source Vault-relative Markdown ID.
- `title`: the note title.
- `heading_path`: ordered Markdown headings containing the chunk.
- `content`: the original Markdown substring used for retrieval.
- `start_offset` / `end_offset`: character offsets in normalized full source text.
- `content_hash`: SHA-256 of normalized chunk content.

Chunking groups paragraphs under Markdown headings toward a 450-token maximum. Long paragraphs fall back to sentence and hard-boundary splitting. A roughly 50-token overlap is retained between adjacent pieces of the same section. Short sections remain short; they are never padded merely to satisfy a minimum.

## Embedding and cache contract

Chunk embeddings use the configured multilingual model, currently `BAAI/bge-m3`, and remain in the original high-dimensional space. The cache is separate from `knowledge-space.json` and records model, revision, dimension, normalization, chunking configuration, chunk IDs, content hashes, and vector rows.

An update compares the current chunk identity and content hash with the cache:

- unchanged chunk + matching model/config: reuse its vector;
- new or changed chunk: encode it;
- removed chunk: omit it from the rebuilt index.

The final matrix is rebuilt in deterministic chunk order and written atomically with its metadata.

## Retrieval contract

`POST /search` accepts:

```json
{"query":"手眼标定","top_k":5,"min_score":0.0,"note_id":"optional.md"}
```

`query` is required. `top_k` defaults to 5 and is bounded to 1–50. `min_score` is optional and filters cosine similarity after ranking. `note_id` is an optional exact source-note filter.

Success:

```json
{
  "query": "手眼标定",
  "results": [
    {
      "chunk_id": "robotics/calibration.md::视觉/手眼标定::0000",
      "note_id": "robotics/calibration.md",
      "title": "手眼标定",
      "heading_path": ["视觉", "手眼标定"],
      "content": "...",
      "start_offset": 24,
      "end_offset": 318,
      "content_hash": "...",
      "score": 0.81
    }
  ]
}
```

All API errors use one shape:

```json
{"error":{"code":"VALIDATION_ERROR","message":"..."}}
```

The service binds to `127.0.0.1` by default. It is a local development interface, not an authenticated public service.

## Index choice

For the first 100–1,000 notes and their chunks, exact cosine search over a normalized NumPy matrix is sufficient, transparent, and dependency-light. The `ChunkVectorIndex` boundary leaves room for FAISS or another ANN backend later without changing `/search`.

## Reproducibility

UMAP and note coordinates are untouched. Chunk retrieval is reproducible when the Vault source, chunking configuration, embedding model/revision, and vector cache are unchanged. Chunk offsets are based on decoded UTF-8 text normalized to `\n`; the original Vault file remains read-only.
