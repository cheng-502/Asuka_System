# MVP-1 Implementation Checklist

## Phase 1 — Foundation

- [x] Task 1: Bootstrap the dual-runtime project
- [x] Task 2: Define and validate the shared knowledge-space contract

### Checkpoint: Foundation

- [x] Python and frontend install/build successfully
- [x] Shared fixture validates in both runtimes
- [x] No private Vault data or generated vectors are staged

## Phase 2 — Offline Knowledge Pipeline

- [x] Task 3: Implement Vault scanning and Markdown parsing
- [x] Task 4: Add local multilingual Embedding and cache persistence (real model run deferred to Task 13)
- [x] Task 5: Build Wikilink and Semantic Link relationships
- [ ] Task 6: Implement UMAP projection, Vault hash, and atomic artifact writing

### Checkpoint: Offline Pipeline

- [ ] Fixture Vault produces a valid artifact
- [ ] Pipeline unit/integration tests pass
- [ ] Real Vault indexing status is recorded
- [ ] Similarity distribution is available for threshold calibration

## Phase 3 — Static Browser Knowledge Space

- [ ] Task 7: Build artifact loader and Three.js scene shell
- [ ] Task 8: Render nodes, relationship edges, hover, and selection
- [ ] Task 9: Add selected-node detail panel and relationship tabs

### Checkpoint: Static Space

- [ ] Fixture artifact renders as a navigable 3D space
- [ ] Mouse hover and selection work
- [ ] Detail tabs work
- [ ] Frontend build and smoke tests pass

## Phase 4 — Hand Tracking and Gesture Interaction

- [ ] Task 10: Add pinned local Hand Landmarker asset and camera preview
- [ ] Task 11: Implement the pure Gesture Engine
- [ ] Task 12: Integrate Pointer/Raycaster events and complete the gesture demo loop

### Checkpoint: Gesture Integration

- [ ] Local model loads
- [ ] Camera preview/status work
- [ ] Gesture Engine tests pass
- [ ] Pointer, Pinch, Open Palm, and No Hand work with the fixture artifact

## Phase 5 — Real Vault Demo and Calibration

- [ ] Task 13: Index the real Vault and calibrate semantic threshold
- [ ] Task 14: End-to-end Demo QA and performance pass

### Checkpoint: MVP-1 Complete

- [ ] Project acceptance criteria pass
- [ ] Tests, build, and manual demo results are recorded
- [ ] Systematic debugging findings are resolved or documented
- [ ] Code review is complete
- [ ] Verification-before-completion checklist is complete
