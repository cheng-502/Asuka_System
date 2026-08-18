# MVP-2A Chunk Retrieval Implementation Plan

## Goal

Implement local Markdown chunk retrieval for 100–1,000 notes while preserving the MVP-1 split: UMAP coordinates are visualization-only, and retrieval uses raw high-dimensional chunk embeddings.

## Tasks

- [x] Task A1: Extend parsed notes with normalized source text and add deterministic Markdown-aware chunk records.
- [x] Task A2: Add chunk embedding generation, versioned cache persistence, and exact cosine vector index.
- [x] Task A3: Add incremental index rebuild that reuses unchanged chunk vectors and removes deleted chunks.
- [x] Task A4: Define and implement the local `POST /search` HTTP contract with boundary validation and structured errors.
- [x] Task A5: Add CLI commands for building/updating the chunk index and starting the local retrieval service.
- [x] Task A6: Document setup, cache files, API examples, and update project progress/findings.
- [x] Task A7: Run Python tests, frontend regression tests, build, CLI smoke test, and a fixture end-to-end retrieval check.

## Exit criteria

- Markdown sections produce stable chunk IDs, exact normalized offsets, content hashes, and heading paths.
- Re-running indexing without source/model/config changes encodes zero chunks.
- Changed, added, and removed chunks are reflected in the rebuilt index.
- `POST /search` returns ranked chunk records with cosine scores and consistent validation errors.
- The service defaults to localhost and does not write to the Vault.
- Existing MVP-1 tests and frontend build remain green.

## Decisions

- Default model remains `BAAI/bge-m3`; UMAP is never queried for retrieval.
- Default chunk target is 450 estimated tokens with approximately 50-token overlap.
- The initial local index is an exact normalized NumPy matrix; an ANN backend can be substituted later.
- Chunk cache and vector index are versioned local artifacts outside `knowledge-space.json`.

## Verification note

- New Python Chunk/retrieval/CLI tests: 11 passed.
- Existing Python tests excluding the slow UMAP projection test: 34 passed.
- Frontend Vitest: 30 tests passed with `npx vitest run --configLoader runner`.
- Frontend TypeScript check passed; Vite build passed to a writable temporary output directory. The default worktree `dist` and Vite temp directories are protected by the Windows environment, so direct default-output commands report `EPERM` after transforming the application.
- The UMAP determinism test was isolated and remained in a long-running Numba/UMAP compilation path in this environment; no MVP-2A code touches projection logic.
