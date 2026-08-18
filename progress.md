# Auaka System — Progress Log

## 2026-08-17

- Completed MVP intent interview.
- Confirmed the primary demo loop: hand movement controls a pointer; pinch selects a glowing knowledge node; the node expands and related knowledge appears.
- Frozen MVP-1 scope as Obsidian Markdown + note-level embedding + UMAP 3D + Three.js + MediaPipe Hand Landmarker + pointer/pinch/open-palm gesture events.
- Explicitly excluded RAG, chunk embeddings, vector DB, LLM, Agent, voice, Hermes, PCB, and vault mutation from MVP-1.
- Confirmed project path `D:\1job\Auaka System` exists but has no visible files.
- Created `task_plan.md`, `findings.md`, and `progress.md` as persistent project context.
- Started architecture-design phase under the confirmed MVP-1 scope.
- Inspected the Vault directory structure without reading note bodies: 387 Markdown files, with `.obsidian`, asset/attachment folders, templates, code notes, and project planning notes present.
- Confirmed gesture semantics, screen-space Raycaster selection, full-screen layout, upper-left camera preview, node visual encodings, and dual relationship line styles.
- Confirmed selected-node details use tabs for summary, explicit Wikilinks, and semantic neighbors, with the note title persistent.
- Confirmed multilingual embedding as a hard requirement, including a `目标检测` ↔ `object detection` cross-language validation case.
- Confirmed versioned `knowledge-space.json`, traceable generation context, thresholded Top-K semantic links, and dual-layer relationship deduplication rules.
- Confirmed MediaPipe Hand Landmarker as a pinned local asset at `frontend/public/models/hand_landmarker.task` for reproducible offline demos.
- Confirmed Gesture Engine stability rules: smoothed Pointer, stable-frame Pinch/Open Palm events, release-before-retrigger, and timeout-based No Hand clearing.
- Wrote the approved architecture design to `docs/superpowers/specs/2026-08-18-gesture-controlled-knowledge-space-design.md`.
- Added the complete Chinese version at `docs/superpowers/specs/2026-08-18-gesture-controlled-knowledge-space-design.zh-CN.md`.
- Entered implementation planning using `planning-and-task-breakdown` as the available equivalent of the requested `writing-plans` skill.
- Created `tasks/plan.md` and `tasks/todo.md` with ordered implementation tasks, dependencies, checkpoints, acceptance criteria, and verification commands.
- Created isolated worktree `.worktrees/mvp1-implementation` on branch `codex/mvp1-implementation`.
- Confirmed no implementation runtime or test configuration exists yet; dependency installation and baseline tests are pending Task 1.
- Started Task 1 with the CLI acceptance test in the isolated worktree.
- GitHub repository `https://github.com/cheng-502/Asuka_System.git` is configured as `origin`; the MVP-1 branch is pushed, while draft PR creation through the connector previously returned an internal error.

## 2026-08-18

- Completed Task 1: bootstrapped the installable Python Pipeline package, environment-based runtime paths, and placeholder CLI.
- Verified Pipeline tests: 2 tests passed; editable install from `pipeline/pyproject.toml` passed in `pipeline/.venv`; `auaka-pipeline` exited successfully.
- Completed the Vite/TypeScript frontend scaffold, public model directory, shared contract/data/test directories, environment examples, and root setup README.
- Verified frontend with `npm run build`; Vite resolved to `8.2.1` and the build completed successfully.
- Verified the dev server in an authorized environment: `http://127.0.0.1:5173/` returned HTTP 200 and contained the Auaka entry page. Chrome DevTools MCP is not configured, so DOM/console inspection remains pending.
- Saved Task 1 as atomic commits `f6377f4` and `067c077`; the earlier conversation summary remains in commit `2532b31`.

## 2026-08-18 — Task 2

- Added canonical JSON Schema Draft 2020-12 at `contracts/knowledge-space.schema.json`.
- Added shared fixture with note metadata, 3D coordinates, a merged Wikilink + Semantic Link, and an unresolved Wikilink.
- Added Python `KnowledgeSpaceArtifact` typing and boundary validation with cross-record relation-target checks.
- Added TypeScript artifact types and Ajv 2020-12 validation with the same relation-target checks.
- Added Python and Vitest tests for valid artifacts, missing metadata, invalid coordinates, unknown targets, optional unresolved metadata, and the shared fixture.
- Task 2 verification: Python 8 tests passed, TypeScript 6 tests passed, and `npm run build` succeeded.
- Saved Task 2 as atomic commits `f1debb2` and `9b37775`.

## 2026-08-18 — Task 3

- Added deterministic Markdown parsing for frontmatter titles, headings, summaries, domains, fenced-code exclusion, and explicit Wikilinks with aliases/headings.
- Added read-only recursive Vault scanning with normalized relative IDs, configurable exclusions, content hashes, unresolved-link reporting, and read errors.
- Added `auaka-pipeline scan --vault ...` structured JSON reporting for included notes, exclusions, unresolved links, and errors.
- Fixed Windows non-UTF-8 console compatibility by emitting JSON-safe ASCII escapes in the CLI report.
- Real Vault scan result: 351 included notes, 36 excluded files, 575 unresolved Wikilinks, 0 read errors. Exclusions: 23 empty files, 7 excluded-directory files, 6 configured files.
- Task 3 verification: Python 15 tests passed, TypeScript 6 tests passed, and `npm run build` succeeded.
- Saved Task 3 as atomic commits `2ca8e66` and `6a3cb60`.

## Next action

## 2026-08-18 — Task 4

- Added `EmbeddingConfig` with multilingual model, expected dimension, cosine metric, normalization, requested device, revision field, and model-cache path.
- Added a local `SentenceTransformerEmbedder` adapter using a persistent `cache_folder`, plus process-level model reuse.
- Added note-level embedding generation from title and deterministic summary; vectors are validated, converted to `float32`, and normalized before downstream use.
- Added cache persistence as `embeddings.npy` plus `embedding-index.json`, including note IDs, content hashes, shape, model metadata, and runtime device. These files remain outside `knowledge-space.json`.
- Added the `目标检测` ↔ `object detection` cosine-similarity sanity check and an opt-in real-model integration test.
- Added deterministic fake-embedder tests for normalization, row mapping, cache round-trip, cross-language checking, and failure behavior.
- Task 4 verification: Python 20 tests passed, including 1 intentionally skipped opt-in real-model test; frontend Vitest 6 tests passed; `npm run build` succeeded; `sentence-transformers` is not installed in the current environment, so no model download was triggered.
- Actual model revision/dimension capture remains an explicit real-Vault verification item for Task 13.

## 2026-08-18 — Task 5

- Added deterministic relationship generation in `pipeline/src/auaka_pipeline/relationships.py`.
- Explicit Wikilinks are preserved, unresolved targets remain reportable, duplicate unresolved links are collapsed, and resolved self-links remain in the data layer for the renderer to decide how to display.
- Semantic candidates use cosine similarity, configurable `max_neighbors`, and an optional `min_similarity`; `None` deliberately enables calibration mode without a guessed threshold.
- Resolved pairs are canonicalized by sorted note IDs. Wikilink + Semantic Link overlap becomes one record with both types and the semantic similarity value.
- Added similarity distribution diagnostics with count, min/max/mean, quartiles, threshold, and Top-K settings.
- Task 5 verification: Python 24 tests passed, including 1 intentionally skipped real-embedding test; frontend Vitest 6 tests passed; `npm run build` succeeded.

## 2026-08-18 — Task 6

- Added deterministic UMAP 3D projection with `n_components=3`, `random_state=42`, cosine metric, and deterministic two-note/one-note edge handling.
- Added canonical included-note hashing from Vault-relative IDs and content hashes.
- Added versioned artifact assembly with node metadata, relationship records, embedding/runtime metadata, UMAP metadata, source hash, and note count.
- Added schema validation before atomic artifact replacement; failed validation leaves the previous artifact unchanged.
- Extended the shared embedding schema with optional revision, requested device, and runtime device metadata.
- Added `umap-learn` as a Pipeline dependency. Task 6 verification: Python 28 tests passed, including 1 intentionally skipped real-embedding test.

## Next action

Begin Task 7 in the isolated worktree: build the artifact loader and full-screen Three.js scene shell.

## 2026-08-18 — Task 7

- Added a browser artifact loader that fetches `/data/knowledge-space.json` and validates it with the shared Ajv schema before rendering.
- Added a full-screen Three.js scene shell with PerspectiveCamera, WebGLRenderer, damping OrbitControls, resize handling, and mouse fallback.
- Added a checked-in fixture artifact at `frontend/public/data/knowledge-space.json` for offline browser startup.
- Added loading and error status states instead of allowing artifact failures to crash the entry page.
- Added `three` and `@types/three`. Task 7 verification: 8 Vitest tests passed and `npm run build` succeeded; Vite reports a bundle-size warning from the Three.js baseline.

## Next action

## 2026-08-18 — Tasks 8–9

- Added artifact-coordinate node meshes with deterministic domain colors, link-count sizing, hover scaling, and selected glow.
- Added relationship edge rendering: solid Wikilinks, dashed pure Semantic Links, one solid visual edge for dual-type records, and visual filtering for unresolved/self links.
- Added screen-space mouse Raycaster hover and click selection; the same scene exposes `selectNode` and `clearSelection` for later gesture integration.
- Added selected-node detail panel with persistent title and Summary, Wikilinks, and Semantic Neighbors tabs. Semantic details are capped at five and unresolved Wikilinks remain visible.
- Added responsive overlay styling and helper tests. Frontend verification: 12 Vitest tests passed and `npm run build` succeeded; Vite reports only the expected Three.js bundle-size warning.

## Next action

Begin Task 10 in the isolated worktree: add the local Hand Landmarker asset and upper-left camera preview/status surface.

## 2026-08-18 — Tasks 10–12

- Added the pinned local `frontend/public/models/hand_landmarker.task` asset (SHA-256 `FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1`) and copied MediaPipe Tasks Vision WASM runtime files into `frontend/public/wasm` for offline loading.
- Added `HandTracker` with local model/WASM paths, user-triggered camera permission, graceful failure status, and normalized landmark delivery.
- Added pure `GestureEngine` events: smoothed screen-space Pointer, stable Pinch with release-before-retrigger, stable Open Palm, and timeout-based No Hand.
- Added `InteractionController` so mouse and hand events share the same Three.js state transitions. Pointer uses normalized screen-space Raycaster mapping; Pinch selects; Open Palm clears selection/detail; No Hand clears hover.
- Frontend verification: 19 Vitest tests passed and `npm run build` succeeded. The build reports the expected Three.js bundle-size warning; camera hardware permissions remain a manual environment check.

## Next action

Begin Task 13 in the isolated worktree: run the complete Pipeline on the real 351-note Vault, install/use the selected multilingual model, inspect similarity distribution, calibrate threshold, and generate the real artifact.

## 2026-08-18 — Tasks 13–14 and MVP-1 verification

- Added the `auaka-pipeline generate` command for scan → local model → vector cache → relationships → UMAP → validated atomic artifact.
- Real Vault generation completed: 351 notes, 575 unresolved Wikilinks, 1,426 link records at `max_neighbors=5` and `min_similarity=0.60`, source hash `74ecb5820ea2c09b69e0fe9ae435f3f86ad0dc433cddd8821f6791da031d036c`.
- Real embedding metadata: `BAAI/bge-m3`, dimension 1024, CPU runtime, revision `5617a9f61b028005a4858fdac845db406aefb181`. The model sanity pair `目标检测` ↔ `object detection` scored `0.644856`.
- Real artifact is private and ignored at `data/knowledge-space.real.json`; vector cache and model cache are ignored. The checked-in browser fixture remains small and safe.
- Similarity calibration and threshold rationale are recorded in `findings.md`; the browser can select the private artifact with `?artifact=/data/knowledge-space.real.json` after copying it into the ignored public data path.
- HTTP smoke verification returned 200 for the Vite page, real artifact, local Hand Landmarker model, and local WASM runtime. The app was opened in the Codex browser panel for local visual inspection. Camera hardware permission/gesture execution is documented as the remaining environment-dependent manual check.
- Final automated verification: Python full suite passed after Task 6 (28 tests at that checkpoint) and the post-fix relationship suite passed; frontend suite passed with 19 Vitest tests and `npm run build` succeeded. Vite's only build warning is the expected Three.js bundle-size warning.

## MVP-1 completion note

The requested MVP-1 implementation is complete in the isolated worktree and GitHub branch. The only non-automated item is granting camera permission and physically performing the hand demo on the user's machine; the code path, local assets, fallback behavior, tests, runbook, and real artifact generation are all present.

## 2026-08-18 — Camera exit and mouse fallback follow-up

- Added a time-based `auto_exit` event after 15 seconds without a detected hand.
- Auto exit and manual **Close camera · mouse mode** share the same lifecycle: stop requestAnimationFrame, stop MediaStream tracks, close the Hand Landmarker, reset gesture state, clear hand hover, and keep the Three.js scene open.
- Mouse OrbitControls and mouse selection remain available while the camera is active; the explicit close action stops hand pointer events when mouse-only interaction is preferred.
- Added regression coverage for Auto Exit timing/retrigger behavior, tracker cleanup, interaction routing, and the preview close control. Frontend verification: 22 Vitest tests passed.

## 2026-08-18 — Camera framing and compact status card follow-up

- Replaced the fixed `(0, 0, 8)` camera framing with a persisted-node-bound calculation: the camera targets the knowledge cloud center and starts from a diagonal external view.
- Explicitly enabled OrbitControls zoom, set a bounded but generous min/max distance, and tuned zoom/pan speed so the full space can be inspected and enlarged.
- Reduced the lower-left status card to a compact approximately half-size layout; the upper-left camera preview remains unchanged.
- Verification: 24 frontend tests passed and `npm run build` passed; the only build message is the existing Three.js chunk-size warning.

## 2026-08-18 — Node density/readability calibration

- Reduced node base radius from `0.1` to `0.055` and per-link radius contribution from `0.012` to `0.006`; reduced hover/selected scale multipliers.
- Increased UMAP `min_dist` from `0.10` to `0.25` while keeping `n_neighbors=15`, regenerated the private real artifact, and recorded both parameters in the versioned schema metadata.
- Verification: Pipeline 30 tests passed with 1 opt-in real-model test skipped; frontend 25 tests passed; production build passed.

## 2026-08-18 — Interaction HUD follow-up

- Added a compact lower-right Interaction guide for Pointer, Pinch, Open Palm, No Hand, and Mouse fallback commands.
- The guide uses text labels and action descriptions, stays clear of the upper-left camera preview and desktop detail panel, and moves to the upper-right on narrow screens to avoid the mobile detail panel.
- Verification: frontend 26 tests passed and production build passed; the existing Three.js bundle-size warning remains the only build warning.
