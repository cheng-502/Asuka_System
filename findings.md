# Auaka System — Findings and Decisions

## Project Context

- Project directory: `D:\1job\Auaka System`
- Directory was found and currently contains no visible files.
- MVP-1 is therefore treated as a new project foundation rather than a modification to an existing implementation.
- Source Obsidian Vault: `C:\Users\lin20\Desktop\广药文件\Obsidian Vault`
- Read-only inventory found 387 Markdown files.
- The Vault contains hidden/configuration folders, attachments/assets, templates, code-learning folders, and project notes; ingestion needs explicit exclusion rules.

## Confirmed Product Intent

The distinctive first demo is not a chatbot. It is a spatial interface for a personal knowledge base: the user sees their real Obsidian knowledge represented as a semantic 3D space and uses hand motion to navigate and select knowledge.

## Confirmed Data Separation

MVP-1 uses only note-level embeddings:

```text
Obsidian Markdown → Note Embedding → UMAP 3D → Three.js
```

The later system will use a separate chunk-level retrieval path:

```text
Chunk Embedding → Vector DB → RAG → LLM / Agent
```

The UMAP coordinates are for human-facing visualization and must not be used as a replacement for retrieval vectors.

## Confirmed Embedding Requirement

- Embeddings must be multilingual.
- Cross-language semantic equivalence is a hard requirement: Chinese `目标检测` and English `object detection` should be near each other in embedding space and therefore plausibly near each other in the UMAP visualization.
- The model runs locally during offline indexing; the browser never loads the embedding model.

## Confirmed Interaction Separation

```text
Camera → MediaPipe Hand Landmarker → Gesture Engine
       → Pointer / Pinch / Open Palm → Three.js interaction
```

The gesture engine should emit semantic events, not directly manipulate Three.js internals. This keeps hand tracking replaceable and makes interaction testable without a camera.

## Confirmed MVP-1 Interaction Contract

- Pointer: extended index fingertip controls a 2D screen pointer.
- Pinch: index fingertip and thumb pinch selects the node under the pointer.
- Open Palm: cancels the current selection or collapses node details.
- Selection method: normalized fingertip screen coordinates → Three.js Raycaster → hovered/intersected node.
- Main layout: full-screen 3D knowledge space with a small camera preview in the upper-left corner.

## Confirmed Hand-Tracking Asset Policy

The Hand Landmarker model is a versioned local asset:

```text
frontend/public/models/hand_landmarker.task
```

The model is pinned and loaded locally to prioritize reproducibility, eliminate runtime download uncertainty, stabilize development/demo behavior, reduce HCI coupling to external services, and support offline demonstrations.

## Confirmed Node Visual Encoding

- Position: UMAP 3D coordinates.
- Color: Obsidian top-level folder / knowledge domain.
- Size: explicit Obsidian link count.
- Glow: current Pointer hover or Pinch selection.
- Solid edges: explicit `[[wikilink]]` relationships.
- Dashed edges: embedding semantic-neighbor relationships.

## Confirmed Node Detail UI

- The note title remains visible after selection.
- Detail content is organized as three switchable tabs:
  - Summary
  - Explicit Wikilink relationships
  - Embedding semantic-neighbor relationships
- The panel should not dump the full note body into the 3D scene.

## Confirmed Knowledge-Space Artifact Contract

`knowledge-space.json` is versioned and stores computation context, not only nodes:

```json
{
  "version": 1,
  "generated_at": "...",
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimension": 1024
  },
  "umap": {
    "n_components": 3,
    "random_state": 42
  },
  "source": {
    "vault_hash": "..."
  },
  "nodes": [],
  "links": []
}
```

The final design must also identify the pipeline version used to generate the artifact so layout changes can be traced to Vault content, model, UMAP parameters, or pipeline code.

## Confirmed Semantic-Link Policy

- Store a bounded Top-K semantic-neighbor candidate list with similarity values.
- Render at most 5 semantic links for the currently focused node.
- Apply `similarity >= threshold` in addition to Top-K; do not force five links for isolated notes.
- Do not hard-code the threshold before inspecting the real Vault's similarity distribution. Calibrate it after the first real indexing run.

## Confirmed Relationship-Deduplication Policy

- Wikilink relationships are explicit user-authored knowledge and remain fully preserved in the data layer.
- Semantic links are model-inferred and remain separately represented with similarity values.
- If the same pair has both relationship types, preserve both in data and render one visually merged edge with combined relationship metadata.
- Unselected nodes use local/low-opacity relationship rendering; a selected node reveals its complete Wikilink neighborhood.

## Product Evolution (Not MVP-1)

- MVP-2: voice query, knowledge search, knowledge-space focus, chunk embeddings, vector search, RAG, and LLM answers.
- MVP-3: Agent actions that retrieve knowledge, create/update Obsidian notes, re-embed the vault, and add new nodes to the space.

## Design Principle

The final differentiator is a knowledge space that can eventually be changed by an Agent. MVP-1 intentionally proves the spatial knowledge interface and hand interaction first, before adding retrieval or automation complexity.

## 2026-08-18 — Real Vault calibration

- The read-only scan completed against the configured Obsidian Vault with 351 included notes, 36 excluded Markdown files, 575 unresolved Wikilinks, and 0 read errors.
- The local `BAAI/bge-m3` run used dimension 1024 on CPU and cached model revision `5617a9f61b028005a4858fdac845db406aefb181`.
- The model-only cross-language sanity check for `目标检测` and `object detection` returned cosine similarity `0.644856`, above the integration threshold `0.3`. The real Vault did not contain exact note titles for both strings, so this pair was validated through the selected model's sanity test rather than a direct note-to-note match.
- The full pairwise diagnostic contained 61,425 unique similarities: min `0.177512`, p25 `0.383474`, median `0.424516`, p75 `0.468180`, mean `0.435337`, max `1.0`.
- Threshold decision: use `min_similarity=0.60` together with `max_neighbors=5`. Candidate counts were 1,331 semantic records at `0.50`, 1,055 at `0.55`, 649 at `0.60`, 383 at `0.65`, and 271 at `0.70`; `0.60` selects the high-similarity tail without making the graph too sparse.
- The generated real artifact is kept at ignored path `data/knowledge-space.real.json`; high-dimensional vectors and model cache are also ignored. No Vault files are written by the Pipeline.

## 2026-08-18 — Spatial readability calibration

- Node visual radius is intentionally independent from semantic distance. It now uses `0.055 + min(explicit_link_count, 12) * 0.006`, with smaller hover/selected multipliers, so link count remains visible without making dense clusters merge visually.
- UMAP `n_neighbors=15` remains unchanged for the current local/global balance. `min_dist` increased from `0.10` to `0.25` to create more separation among nearby nodes; this changes persisted 3D coordinates and therefore required regenerating the real artifact.
- The updated real artifact keeps the same 351 notes, source hash, embedding model and semantic threshold, while recording `n_neighbors=15` and `min_dist=0.25` in its UMAP metadata.
