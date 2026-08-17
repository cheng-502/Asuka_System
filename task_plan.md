# Auaka System — MVP-1 Task Plan

## Goal

Build a gesture-controlled personal knowledge space that reads a real Obsidian Markdown vault, embeds notes at note level, projects them into a semantic 3D layout with UMAP, and renders/interacts with the result in Three.js.

## Frozen MVP-1 Scope

### In scope

- Obsidian Markdown notes
- Note-level embeddings
- Multilingual note-level embeddings with a cross-language semantic check
- UMAP 3D coordinates for visualization only
- Versioned `knowledge-space.json` with generation context and source fingerprint
- Three.js knowledge-space rendering
- Camera input
- MediaPipe Hand Landmarker
- Gesture engine
- Three gesture events: pointer movement, pinch selection, open-palm interaction
- Node expansion and display of associated knowledge relationships

### Explicitly out of scope

- Chunk embeddings
- Vector database
- RAG
- LLM
- Voice
- Hermes or other Agent runtime
- PCB or custom hardware
- Automatic note creation or vault mutation

## Phase Status

| Phase | Status | Exit criterion |
|---|---|---|
| 1. Intent and MVP freeze | complete | Scope and demo loop explicitly confirmed by user |
| 2. Repository and runtime orientation | complete | Project path checked; no existing files detected |
| 3. Architecture design | in_progress | User approves component boundaries and data contracts |
| 4. File-based implementation plan | pending | Implementation tasks and verification commands are written |
| 5. Isolated worktree setup | pending | Feature work has an isolated branch/worktree |
| 6. Incremental implementation | pending | Vertical slices for ingestion, projection, rendering, and gestures complete |
| 7. Systematic debugging and code review | pending | Runtime issues resolved and review findings addressed |
| 8. Verification before completion | pending | Acceptance demo passes with a real or representative vault |

## Acceptance Criteria

1. A configured Obsidian vault can be parsed without modifying note contents.
2. Each note receives one stable embedding and one stable visualization record.
3. UMAP produces deterministic 3D coordinates when the same dataset and seed/configuration are used.
4. `knowledge-space.json` records schema version, generation time, embedding model/dimension, UMAP parameters, source Vault hash, and pipeline version.
5. Three.js renders nodes in a navigable 3D scene with readable labels or detail-on-focus.
6. Hand movement controls a visible pointer or focus marker in real time.
7. Pinch selects a node and expands its detail/relationship view.
8. Open palm performs one defined scene interaction without triggering repeated accidental actions.
9. The complete demo can be recorded: hand enters camera view → pointer follows → pinch selects a node → node expands → related knowledge becomes visible.

## Known Risks to Resolve During Design

- Note-level embedding model/runtime and local/offline constraints are not yet chosen.
- UMAP 3D layout stability and update strategy are not yet defined.
- Obsidian graph links and embedding similarity need a clear relationship model.
- MediaPipe coordinate space must be mapped to the Three.js camera/view consistently.
- Gesture debouncing, cooldowns, and loss-of-tracking behavior need explicit rules.
- Gesture stability will use smoothed Pointer output, stable-frame event recognition, release-before-retrigger for Pinch, and timeout-based No Hand clearing.
- Empty project directory means runtime/tooling conventions are not yet established.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Patch context mismatch while updating planning files | 1 | Re-read current file sections and applied smaller targeted patches |
| Design document parent directory did not exist; sandbox directory creation was denied | 1 | Requested scoped permission, created `docs/superpowers/specs`, and retried the document write |
