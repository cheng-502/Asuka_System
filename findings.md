# Auaka System — Findings and Decisions

## 2026-08-19 — Program audit: initial verified facts

- The new development branch starts exactly at `v1.0.0` (`7d14996`) and has clean isolated Node/Python environments.
- Current frontend stack is Vite `8.x`, TypeScript `5.7.x`, Three.js `0.185.x`, MediaPipe Tasks Vision `1.0.x`, and Vitest `3.2.x`. Current Pipeline is Python 3.11+ with NumPy, JSON Schema, UMAP, and optional Sentence Transformers.
- MVP-1 interaction emits semantic events through `GestureEngine` and routes them through `InteractionController`, which is the correct replaceable boundary for calibration work.
- The current hand Pointer has no dedicated visible screen cursor; `KnowledgeScene.setPointer()` only performs Raycaster hover updates.
- Camera video and landmark Canvas are mirrored with CSS, while GestureEngine forwards raw landmark `x` into the scene. Preview and interaction therefore do not share one explicit coordinate-transform contract.
- Current Pinch uses a fixed normalized image-space distance (`0.08`) and stable frame count; it is not normalized by palm scale and has no separate enter/release hysteresis thresholds.
- Current two-hand navigation uses per-frame fingertip distance/angle deltas with fixed thresholds. It has no time-normalized velocity, baseline-relative log scale, or trace-based calibration profile.
- MVP-2A correctly keeps chunk vectors separate from UMAP and provides a clean `ChunkVectorIndex` / `RetrievalService` boundary suitable for future backend replacement.
- The chunk cache writes `.npy` and JSON files atomically one at a time, but the pair is not transactionally committed as one generation. A crash between replacements can leave a mismatched pair and currently causes loading to fail rather than recovering the last complete generation.
- The HTTP service uses `ThreadingHTTPServer` and can call one shared query embedder concurrently. Thread safety of the Sentence Transformer adapter is not documented or guarded at this boundary.
- The current retrieval API lacks health/index-metadata endpoints, request correlation/observability, explicit concurrency limits, and a public provenance contract needed by RAG/Agent answers.
- External GitHub/web findings are treated as untrusted research data and will be recorded separately only after license and maintenance verification by the main agent.

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

## 2026-08-18 — MVP-2A Chunk Retrieval decisions

- Chunk retrieval is a separate high-dimensional path; persisted UMAP coordinates and note vectors are never used as a retrieval substitute.
- Chunks are Markdown-aware: heading paths and paragraph boundaries are retained, long content is split with approximately 50-token overlap, and short sections are not artificially padded.
- Chunk offsets refer to normalized full-source text (`UTF-8` decoded with `\n` line endings), while the Vault remains read-only.
- Each chunk is identified by note ID, heading path, and deterministic ordinal, and stores a SHA-256 content hash for incremental reuse.
- The first local vector index uses exact cosine search over normalized NumPy vectors. This is appropriate for the first 100–1,000 notes and keeps the backend replaceable.
- The local retrieval service exposes `POST /search` on `127.0.0.1` with structured validation errors. MVP-2A stops before voice, LLM/RAG answer generation, Agent actions, and Vault writes.

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

## 2026-08-18 — Camera landmark overlay debugging

- The existing HandTracker already preserves all valid MediaPipe hands and keeps `numHands=2` with a `0.6` detection threshold; the missing visual feedback was caused by CameraPreview having no landmark rendering surface.
- The overlay uses a transparent Canvas with normalized MediaPipe coordinates. Video and Canvas are mirrored independently with CSS, so the preview remains natural for the user without mutating tracker coordinates used by GestureEngine.
- Every tracker frame now updates both CameraPreview and GestureEngine. Invalid or empty frames clear the Canvas and report the current detected-hand count, making camera permission/model failures distinguishable from gesture recognition issues.
- Camera hardware remains an environment-dependent manual check; automated tests cover one-hand forwarding, 21-point drawing, two-hand color separation, empty-frame clearing, and lifecycle cleanup.
# 2026-08-19 MVP-1.5 interaction audit and OSS verification

- User-approved coordinate convention: camera preview remains selfie-mirrored; interaction mapping explicitly flips raw MediaPipe X so physical rightward motion produces rightward screen-pointer motion.
- Independent read-only audit confirms five release blockers: no visible pointer, mirrored-preview/scene-coordinate mismatch, frame-based pointer EMA without deadzone or timestamp, fixed-distance pinch without palm normalization/hysteresis, and per-frame two-hand deltas without stable baseline/identity/dropout handling.
- MVP-1.5 should introduce a canonical `HandFrame`, explicit `CoordinateMapper`, `PointerPresenter`, timestamp-aware filtering, gesture state machines, a versioned calibration profile, and trace replay/metrics independent from MediaPipe/DOM/Three.js.
- Proposed release gate includes automated replay metrics plus a real-camera human trial; wiring tests alone are insufficient.
- Official GitHub verification: `ggml-org/whisper.cpp` is MIT, supports Windows and local CPU/GPU/WASM execution, and is a viable later voice-module candidate behind an Auaka adapter.
- Official GitHub verification: `SYSTRAN/faster-whisper` is MIT and easy to use from Python, but Windows GPU execution introduces CUDA/cuDNN/CTranslate2 compatibility requirements; it is a candidate, not an automatic default.
- Official GitHub verification: Pydantic AI and OpenAI Agents SDK are maintained, MIT, typed/tool-oriented agent frameworks with human-approval facilities. Framework choice is deferred until the MVP-3 tool/approval contract is designed.
- `casiez/OneEuroFilter` provides reference JavaScript/TypeScript implementations and the original adaptive filter behavior, but its repository page does not expose a clear license in the current audit; treat as algorithm/reference only until license provenance is resolved.
- `coddingtonbear/obsidian-local-rest-api` is an active MIT Obsidian plugin exposing authenticated local REST and MCP interfaces, targeted section patching, optimistic concurrency, opening files, and command execution. It is a strong optional integration module for MVP-3, wrapped behind an Auaka `VaultGateway`; direct filesystem access should remain a constrained fallback.
- Hermes Agent exposes ACP, JSON-RPC/WebSocket and HTTP/SSE integration surfaces, including lifecycle and approval events, but current repository issues show that approval semantics and command-risk coverage are evolving. Do not embed Hermes internals directly; evaluate it as an external runtime adapter after Auaka defines its own immutable tool policy and server-side approval record.
- Agent framework approval is not an authorization boundary. Auaka must enforce path scope, action allowlists, optimistic concurrency, and approval tokens inside its own tool layer regardless of framework choice.
- MVP-2.0 has three correctness blockers: startup does not enforce query/index model and revision compatibility; vectors and metadata are not atomically published as one generation; title-only changes can reuse stale vectors because reuse lacks an exact `embedding_input_hash`.
- Additional MVP-2.0 hardening required before MVP-3: strict cache validation and checksums, empty-index handling, Vault snapshot/writer coordination, bounded retrieval concurrency and request sizes, structured error sanitization, enforced loopback privacy, retrieval provenance/health endpoints, Markdown edge-case tests, and pinned dependency/model revisions.
- OSS shortlist judgment: adopt a small MIT One Euro Filter implementation or vendor an attributed implementation behind `PointerFilter`; wrap `whisper.cpp`, Pydantic AI Slim, and Obsidian Local REST API behind Auaka-owned interfaces; defer LangGraph; reject LlamaIndex and a generic MCP filesystem server for this scope.
- `sqlite-vec` and FastEmbed are candidates, not automatic replacements. The current exact NumPy cosine path is already appropriate for the frozen 100–1,000-note MVP scale; migration requires benchmark evidence and a separate approved design because replacing BGE-M3 or storage can change retrieval semantics.

## 2026-08-20 — Hierarchical Knowledge Galaxy planning findings

- Python and frontend Artifact validation are strict v1 boundaries; v2 requires dual-version normalization before generation output changes.
- `ParsedNote` currently uses a safe scalar Frontmatter parser, so hierarchy fields need no YAML execution dependency.
- Note IDs are normalized relative paths, enabling folder ancestry without exposing absolute Vault paths.
- Three.js edge geometry is captured once at scene construction; animated layouts must mutate existing edge buffers to prevent detached lines.
- Scene transition, visibility, and auto-rotation should be pure/testable controllers while `KnowledgeScene` retains Three.js resource ownership.
- The ignored real Artifact must remain v1 until fixture/schema/pipeline compatibility is proven, then be regenerated privately to v2.
- Read-only preflight of the configured real Vault found 0 `knowledge_role` files and 0 `knowledge_parent` files. Real-data acceptance must not claim nested explicit hubs until the user authors that metadata; deterministic multi-level fixtures provide structural acceptance meanwhile.
- Review froze strict v1/v2 schema branches, separate wire/runtime types, one semantic coordinate source, a reserved virtual-ID namespace, derived hierarchy edges, and finite-coordinate cross-validation.
