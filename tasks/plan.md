# MVP-1 Implementation Plan: Gesture-Controlled Personal Knowledge Space

## Overview

Build MVP-1 as a local Python offline Knowledge Pipeline plus a Vite/TypeScript browser application. The Pipeline reads the configured Obsidian Vault, creates multilingual note-level embeddings, computes UMAP 3D coordinates and relationship metadata, and writes a versioned `knowledge-space.json`. The browser loads that artifact, renders the 3D space with Three.js, reads a local MediaPipe Hand Landmarker model, emits semantic gesture events, and lets the user hover/select nodes and inspect their relationships.

MVP-1 does not include chunk embeddings, Vector DB, RAG, LLM, voice, Agent runtime, or Vault mutation.

## Architecture Decisions

- Use Python for offline parsing, local multilingual Embedding, relationship analysis, UMAP, hashing, and artifact generation.
- Use Vite + TypeScript + Three.js for browser rendering and interaction.
- Keep `knowledge-space.json` separate from the high-dimensional embedding cache.
- Treat the JSON artifact as a versioned boundary validated by both Python and TypeScript.
- Keep Gesture Engine independent from Three.js and emit semantic events only.
- Use a local, versioned `frontend/public/models/hand_landmarker.task` asset.
- Use normalized Vault-relative paths as MVP-1 note IDs.
- Preserve Wikilink and Semantic Link types separately in data; merge only at visual rendering time.
- Calibrate the semantic similarity threshold from the real Vault distribution instead of assuming a universal value.

## Proposed Repository Structure

```text
Auaka System/
├── pipeline/
│   ├── src/auaka_pipeline/
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
├── frontend/
│   ├── public/models/hand_landmarker.task
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── vite.config.ts
├── contracts/
│   ├── knowledge-space.schema.json
│   └── fixtures/
├── data/
│   ├── .gitkeep
│   └── README.md
├── tasks/
│   ├── plan.md
│   └── todo.md
└── docs/superpowers/specs/
```

Generated private data such as `embeddings.npy`, `embedding-index.json`, and the real Vault artifact should not be committed by default.

## Dependency Graph

```text
Project bootstrap
      ↓
Artifact schema + fixtures
      ↓
Vault parser ───────────────┐
      ↓                     │
Embedding + cache           │
      ↓                     │
Relations + semantic links  │
      ↓                     │
UMAP + artifact writer ─────┘
      ↓
Frontend loader + static Three.js scene
      ↓
Node/edge interaction + detail tabs
      ↓
Local Hand Landmarker + Gesture Engine
      ↓
Raycaster integration + mouse fallback
      ↓
Real Vault indexing + threshold calibration
      ↓
Systematic debugging + review + final verification
```

## Phase 1: Foundation

### Task 1: Bootstrap the dual-runtime project

**Description:** Create the Python Pipeline package, Vite/TypeScript frontend, shared directory layout, development commands, environment configuration, and safe `.gitignore` rules. Keep the project able to run a placeholder frontend and a placeholder Pipeline command.

**Acceptance criteria:**

- [x] `pipeline` has an installable Python project and a runnable CLI entry point.
- [x] `frontend` starts with Vite and TypeScript.
- [x] `contracts`, `data`, and test directories exist.
- [x] Real Vault paths and model paths are configuration values, not hard-coded in business logic.
- [x] Generated vectors, local caches, environment files, and build output are ignored by Git.

**Verification:**

- [x] Python environment installs from `pipeline/pyproject.toml`.
- [x] Frontend starts and builds with `npm run build`.
- [x] Placeholder Pipeline command exits successfully.

**Dependencies:** None

**Files likely touched:** `pipeline/pyproject.toml`, `pipeline/src/auaka_pipeline/cli.py`, `frontend/package.json`, `frontend/vite.config.ts`, `.gitignore`, `README.md`

**Estimated scope:** Medium

### Task 2: Define and validate the shared knowledge-space contract

**Description:** Create the canonical JSON Schema for `knowledge-space.json`, TypeScript types/validator, Python artifact models/validator, and a small fixture with nodes, Wikilinks, Semantic Links, unresolved targets, and a merged dual-type edge.

**Acceptance criteria:**

- [x] Schema covers version, generated time, pipeline, embedding, UMAP, source, nodes, and links.
- [x] Python and TypeScript reject malformed artifacts at their respective boundaries.
- [x] The fixture demonstrates both separate and merged relationship types.
- [x] Note IDs, coordinates, similarities, and optional unresolved metadata have explicit types.

**Verification:**

- [x] Valid fixture passes Python and TypeScript validation.
- [x] Invalid fixture tests fail for missing required metadata, invalid coordinates, and unknown relation targets where required.

**Dependencies:** Task 1

**Files likely touched:** `contracts/knowledge-space.schema.json`, `contracts/fixtures/knowledge-space.fixture.json`, `pipeline/src/auaka_pipeline/models.py`, `frontend/src/data/types.ts`, `frontend/src/data/validateArtifact.ts`, tests

**Estimated scope:** Medium

### Checkpoint: Foundation

- [ ] Both runtimes install and build.
- [ ] The shared fixture validates in Python and TypeScript.
- [ ] No private Vault content or generated vector files are staged.

## Phase 2: Offline Knowledge Pipeline

### Task 3: Implement Vault scanning and Markdown parsing

**Description:** Implement configurable recursive Markdown scanning, exclusion rules, normalized relative-path IDs, deterministic summary extraction, top-level domain extraction, explicit Wikilink parsing, empty-file handling, and a structured indexing report.

**Acceptance criteria:**

- [x] `.obsidian`, asset directories, templates, empty files, and configured planning files are excluded.
- [x] Included note IDs use normalized `/`-separated Vault-relative paths.
- [x] Summary extraction is deterministic and does not invoke an LLM.
- [x] Wikilinks preserve unresolved targets for reporting and artifact metadata.
- [x] The parser never writes to the Vault.

**Verification:**

- [x] Unit tests cover exclusions, Unicode paths, frontmatter, empty notes, summaries, valid links, and unresolved links.
- [x] A read-only inventory run against the real Vault reports the expected inclusion/exclusion counts without modifying files.

**Dependencies:** Tasks 1–2

**Files likely touched:** `pipeline/src/auaka_pipeline/vault.py`, `pipeline/src/auaka_pipeline/markdown.py`, `pipeline/src/auaka_pipeline/config.py`, `pipeline/tests/test_vault.py`, `pipeline/tests/fixtures/`

**Estimated scope:** Medium

### Task 4: Add local multilingual Embedding and cache persistence

**Description:** Add the local `sentence-transformers` embedding service, model configuration, normalized vector generation, cache persistence, embedding-index mapping, and the required cross-language sanity check for `目标检测` and `object detection`.

**Acceptance criteria:**

- [x] Model name, dimension, normalization, and runtime device are recorded in configuration/cache metadata.
- [x] The model loader uses a persistent local cache and reuses a loaded model within one process.
- [x] Embeddings are written outside the browser artifact as a local cache.
- [x] Cross-language test compares the Chinese and English concept pair using cosine similarity.
- [x] Embedding failures raise a clear error before downstream cache/artifact work.

**Verification:**

- [x] Unit tests use a deterministic small fake embedder without downloading a model.
- [x] An opt-in integration test runs the selected multilingual model when available.
- [ ] The real model run records its actual dimension and model revision.

**Dependencies:** Task 3

**Files likely touched:** `pipeline/src/auaka_pipeline/embeddings.py`, `pipeline/src/auaka_pipeline/cache.py`, `pipeline/src/auaka_pipeline/config.py`, `pipeline/tests/test_embeddings.py`, `pipeline/tests/test_cross_language.py`

**Estimated scope:** Medium

### Task 5: Build Wikilink and Semantic Link relationships

**Description:** Combine parser output and normalized embeddings into canonical relationship records. Preserve explicit Wikilinks, compute bounded semantic candidates with similarity values, detect dual-type overlap, and emit similarity-distribution diagnostics without forcing a threshold prematurely.

**Acceptance criteria:**

- [ ] Wikilinks remain present even when unresolved.
- [ ] Semantic candidates have source, target, type, and similarity.
- [ ] Dual-type pairs are represented by one canonical record with both types.
- [ ] Top-K candidate generation is configurable.
- [ ] Similarity distribution is exported for later threshold calibration.

**Verification:**

- [ ] Tests cover overlap, reverse links, unresolved links, self-links, duplicate edges, and isolated notes.
- [ ] Fixture output matches the approved relationship policy.

**Dependencies:** Tasks 3–4

**Files likely touched:** `pipeline/src/auaka_pipeline/relationships.py`, `pipeline/src/auaka_pipeline/similarity.py`, `pipeline/tests/test_relationships.py`

**Estimated scope:** Medium

### Task 6: Implement UMAP projection, Vault hash, and atomic artifact writing

**Description:** Compute deterministic 3D UMAP coordinates, calculate the included-source Vault hash, assemble the versioned artifact, validate it, and atomically replace the last valid artifact only after all checks pass.

**Acceptance criteria:**

- [ ] UMAP uses `n_components=3` and `random_state=42` by default.
- [ ] Artifact records pipeline version, embedding metadata, UMAP metadata, source hash, and note count.
- [ ] Same input/configuration produces reproducible coordinates within the accepted numeric tolerance.
- [ ] Failed runs do not overwrite the last valid artifact.
- [ ] Artifact schema validation runs before final write.

**Verification:**

- [ ] Determinism test runs projection twice and compares coordinates.
- [ ] Hash test changes when included content or path changes and remains unchanged for excluded content.
- [ ] Atomic-write test simulates a failure before replacement.
- [ ] End-to-end fixture Pipeline produces a valid `knowledge-space.json`.

**Dependencies:** Tasks 2–5

**Files likely touched:** `pipeline/src/auaka_pipeline/project.py`, `pipeline/src/auaka_pipeline/artifact.py`, `pipeline/src/auaka_pipeline/hash_source.py`, `pipeline/tests/test_artifact.py`, `pipeline/tests/test_projection.py`

**Estimated scope:** Medium

### Checkpoint: Offline Pipeline

- [ ] Fixture Vault produces a valid artifact.
- [ ] Parser, Embedding, relationship, UMAP, and artifact tests pass.
- [ ] Real Vault read-only indexing completes or produces a documented model/runtime blocker.
- [ ] Similarity distribution is saved for threshold calibration.

## Phase 3: Static Browser Knowledge Space

### Task 7: Build artifact loader and Three.js scene shell

**Description:** Load a fixture artifact in the Vite app, validate it at runtime, create the full-screen scene/camera/renderer, add basic orbit/mouse fallback, and show an actionable error state for invalid data.

**Acceptance criteria:**

- [ ] The app loads the fixture artifact without a backend service.
- [ ] Invalid artifact data renders an error state rather than crashing.
- [ ] The scene is usable with mouse controls when camera/hand tracking is unavailable.
- [ ] The app builds with the pinned frontend dependencies.

**Verification:**

- [ ] `npm run build` succeeds.
- [ ] Browser smoke test loads valid and invalid fixtures.
- [ ] Console has no uncaught errors during startup.

**Dependencies:** Tasks 1–2, 6

**Files likely touched:** `frontend/src/main.ts`, `frontend/src/data/loadArtifact.ts`, `frontend/src/scene/KnowledgeScene.ts`, `frontend/src/styles.css`, `frontend/tests/loadArtifact.test.ts`

**Estimated scope:** Medium

### Task 8: Render nodes, relationship edges, hover, and selection

**Description:** Render nodes from UMAP coordinates using domain colors, link-count size, focus glow, solid/ dashed relationship styles, merged dual-type edges, and Raycaster hover/selection behavior.

**Acceptance criteria:**

- [ ] Nodes appear at artifact coordinates with stable IDs.
- [ ] Color, size, and glow follow the approved visual encoding.
- [ ] Wikilinks and Semantic Links use distinct line styles.
- [ ] Dual-type pairs render as one edge while retaining both types in metadata.
- [ ] Hover state is distinct from selected state.

**Verification:**

- [ ] Fixture scene smoke test checks node and edge counts.
- [ ] Manual browser check confirms hover and selection with mouse.
- [ ] No invalid target crashes the render loop.

**Dependencies:** Task 7

**Files likely touched:** `frontend/src/scene/nodes.ts`, `frontend/src/scene/edges.ts`, `frontend/src/scene/raycast.ts`, `frontend/tests/scene.test.ts`

**Estimated scope:** Medium

### Task 9: Add selected-node detail panel and relationship tabs

**Description:** Add the upper-left camera/status layout placeholder, selected-node detail panel, persistent title, and Summary/Wikilinks/Semantic Neighbors tabs. Keep detail content from obscuring the primary 3D view.

**Acceptance criteria:**

- [ ] Selected node title remains visible.
- [ ] Three tabs switch without reloading the scene.
- [ ] Summary, Wikilinks, and Semantic Neighbors show only the selected node's data.
- [ ] Selected-node relationships follow the approved rendering limits.
- [ ] Layout remains usable at desktop and narrow widths.

**Verification:**

- [ ] Component tests cover tab switching and empty relationship states.
- [ ] Manual browser check confirms detail panel does not block the main space.

**Dependencies:** Task 8

**Files likely touched:** `frontend/src/ui/DetailPanel.ts`, `frontend/src/ui/GestureStatus.ts`, `frontend/src/app/interactionState.ts`, `frontend/tests/detailPanel.test.ts`

**Estimated scope:** Medium

### Checkpoint: Static Space

- [ ] Fixture artifact renders as a navigable 3D knowledge space.
- [ ] Mouse hover and selection work.
- [ ] Detail tabs work.
- [ ] Frontend build and browser smoke tests pass.

## Phase 4: Hand Tracking and Gesture Interaction

### Task 10: Add the pinned local Hand Landmarker asset and camera preview

**Description:** Add the approved versioned `frontend/public/models/hand_landmarker.task` asset through the project setup process, initialize camera permissions, load the local model, and render the small preview/status surface in the upper-left corner.

**Acceptance criteria:**

- [ ] Browser loads the model from the local asset path without runtime download.
- [ ] Camera permission states are represented clearly.
- [ ] Preview is positioned in the upper-left and does not obscure the primary scene.
- [ ] No-camera mode leaves mouse browsing available.

**Verification:**

- [ ] Model path is checked in the built app.
- [ ] Manual test covers permission granted, denied, and unavailable camera.
- [ ] Browser console has no unhandled model or camera errors.

**Dependencies:** Task 7

**Files likely touched:** `frontend/public/models/hand_landmarker.task`, `frontend/src/hand/HandTracker.ts`, `frontend/src/ui/CameraPreview.ts`, `frontend/src/ui/GestureStatus.ts`

**Estimated scope:** Medium

### Task 11: Implement the pure Gesture Engine

**Description:** Convert hand landmarks into smoothed Pointer coordinates and stable Pinch/Open Palm/No Hand events. Keep thresholds configurable and test the engine with synthetic landmark sequences.

**Acceptance criteria:**

- [ ] Pointer uses the extended index fingertip and smoothing.
- [ ] Pinch requires stable frames, fires once, and requires release before retrigger.
- [ ] Open Palm requires stable frames and emits one cancel/collapse event.
- [ ] No Hand timeout clears Pointer/Hover according to configuration.
- [ ] Engine emits only the approved semantic event union.

**Verification:**

- [ ] Unit tests cover noisy landmarks, stable gestures, release/retrigger, hand loss, and confidence thresholds.
- [ ] Tests run without a camera or browser.

**Dependencies:** Task 10

**Files likely touched:** `frontend/src/hand/GestureEngine.ts`, `frontend/src/hand/gestureMath.ts`, `frontend/src/hand/gestureConfig.ts`, `frontend/tests/GestureEngine.test.ts`

**Estimated scope:** Medium

### Task 12: Integrate Pointer/Raycaster events and complete the gesture demo loop

**Description:** Connect Gesture Events to the Interaction Controller, map normalized coordinates to Raycaster input, apply Pinch selection and Open Palm collapse, and preserve mouse fallback through the same state machine.

**Acceptance criteria:**

- [ ] Pointer follows the index finger in screen space.
- [ ] Pinch selects the hovered node once.
- [ ] Open Palm cancels selection and collapses the detail panel.
- [ ] Temporary tracking loss is stable and timeout behavior is visible.
- [ ] Mouse interaction and hand interaction share the same scene state transitions.

**Verification:**

- [ ] State-machine tests use synthetic Gesture Events.
- [ ] Browser smoke test runs with a recorded/mock event stream if camera automation is unavailable.
- [ ] Manual camera test completes the full hand → pointer → pinch → node expansion loop.

**Dependencies:** Tasks 8–11

**Files likely touched:** `frontend/src/app/InteractionController.ts`, `frontend/src/app/interactionState.ts`, `frontend/src/scene/raycast.ts`, `frontend/tests/InteractionController.test.ts`

**Estimated scope:** Medium

### Checkpoint: Gesture Integration

- [ ] Local model loads.
- [ ] Camera preview and status display work.
- [ ] Gesture Engine tests pass.
- [ ] Pointer, Pinch, Open Palm, and No Hand integrate with the scene.
- [ ] Full interaction loop works with the fixture artifact.

## Phase 5: Real Vault Demo and Calibration

### Task 13: Index the real Vault and calibrate semantic threshold

**Description:** Run the Pipeline against the configured 387-note Vault using the local multilingual model, inspect inclusion/exclusion counts and similarity distribution, choose and record the first threshold, and generate the real artifact without modifying the Vault.

**Acceptance criteria:**

- [ ] Real Vault indexing completes with a report.
- [ ] Artifact metadata records actual model revision, dimension, Pipeline version, UMAP parameters, source hash, and note count.
- [ ] `目标检测` and `object detection` are inspected as a cross-language pair.
- [ ] Similarity threshold is based on observed distribution and recorded in Pipeline configuration/artifact metadata.
- [ ] Generated private data remains outside the commit unless explicitly approved.

**Verification:**

- [ ] Read-only file comparison confirms the Vault was not modified.
- [ ] Artifact schema validates.
- [ ] Similarity diagnostic and calibration decision are saved in the project findings.

**Dependencies:** Checkpoint Offline Pipeline

**Files likely touched:** `pipeline/config/defaults.toml`, `pipeline/reports/`, `findings.md`, `progress.md`

**Estimated scope:** Medium

### Task 14: End-to-end Demo QA and performance pass

**Description:** Verify the real artifact in the browser, tune initial gesture parameters, confirm no-camera fallback, check scene responsiveness with 100–1,000 nodes, and produce a short reproducible Demo runbook.

**Acceptance criteria:**

- [ ] Full acceptance loop works with the real Vault.
- [ ] Three detail tabs, dual relationship rendering, and upper-left preview work together.
- [ ] Gesture tuning values and known limitations are recorded.
- [ ] Reloading the unchanged artifact does not recompute UMAP or move nodes.
- [ ] Demo runbook explains setup, model asset location, Pipeline command, frontend command, and troubleshooting.

**Verification:**

- [ ] Browser console is clean during the acceptance flow.
- [ ] Manual checklist in the design document passes.
- [ ] Build artifacts and private data are excluded from commits.

**Dependencies:** Checkpoint Gesture Integration, Task 13

**Files likely touched:** `docs/demo-runbook.md`, `README.md`, `progress.md`, `findings.md`

**Estimated scope:** Medium

### Checkpoint: MVP-1 Complete

- [ ] All project acceptance criteria pass.
- [ ] Tests, build, and manual demo checks are recorded.
- [ ] Systematic debugging findings are resolved or documented.
- [ ] Code review is complete.
- [ ] Verification-before-completion checklist is complete.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Local multilingual model is slow or unavailable | High | Validate model setup early; use fake embedder for unit tests; fail without replacing last artifact |
| UMAP positions are visually unstable after data changes | Medium | Persist parameters and hashes; document that absolute stability is not guaranteed across changes |
| Semantic similarity threshold produces too many/few links | Medium | Export real distribution; calibrate after first Vault run; require Top-K and threshold |
| Hand gestures trigger repeatedly | High | Stable-frame recognition, cooldown, release-before-retrigger, synthetic event tests |
| Camera permission or model loading fails | Medium | Mouse fallback, actionable status panel, local model path verification |
| 387-note scene becomes visually dense | Medium | Focused relationship rendering, low-opacity unselected edges, max five semantic links on focused node |
| Real Vault contains unexpected Markdown syntax | Medium | Skip/report malformed notes; fixture tests for parser edge cases; no Vault mutation |

## Open Questions to Resolve During Implementation

- Exact pinned revisions for the multilingual embedding model, Python dependencies, npm dependencies, and Hand Landmarker asset.
- Final similarity threshold after inspecting the real Vault distribution.
- Final pointer smoothing and gesture timing values after camera calibration.
- Whether the local model asset is committed to Git or provisioned by a reproducible setup script, subject to repository size and licensing checks.
