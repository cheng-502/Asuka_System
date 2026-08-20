# Auaka System — MVP-1.5 → MVP-3 Task Plan

## Goal

Advance the released `v1.0.0` baseline through three controlled gates: stabilize spatial hand interaction as MVP-1.5, audit and harden the existing Chunk Retrieval foundation into MVP-2.0 readiness, then design and implement MVP-3 Agent actions only when the retrieval contract is sound. Prefer maintained, license-compatible open-source modules behind Auaka-owned adapters instead of embedding third-party internals directly into core domain code.

## Current Branch

- Branch: `codex/interaction-calibration-v1.1`
- Base: `v1.0.0` / `7d14996`
- Worktree: `D:\1job\Auaka System\.worktrees\interaction-calibration-v1.1`

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
| 3. Architecture design | complete | User approved the design document and Chinese version |
| 4. File-based implementation plan | in_progress | Implementation tasks and verification commands are written |
| 5. Isolated worktree setup | complete | Feature work has an isolated branch/worktree |
| 6. Incremental implementation | in_progress | Vertical slices for ingestion, projection, rendering, and gestures complete |
| 7. Systematic debugging and code review | pending | Runtime issues resolved and review findings addressed |
| 8. Verification before completion | pending | Acceptance demo passes with a real or representative vault |

## MVP-1.5 → MVP-3 Program Status

| Gate | Status | Exit criterion |
|---|---|---|
| A. Current-code and dependency audit | completed | MVP-1.5 gaps, MVP-2.0 defects, reusable modules, licenses, and integration risks are documented |
| B. MVP-1.5 design | completed | Pointer, mirror mapping, Pinch, two-hand navigation, telemetry, and replay behavior are approved |
| C. MVP-1.5 implementation | in_progress | Interaction acceptance metrics and real-camera checks pass |
| D. MVP-2.0 readiness review | pending | Retrieval correctness, API boundaries, persistence, incremental updates, security, and performance have no blocking defects |
| E. MVP-2.0 hardening | pending | All blocking findings are fixed and regression-tested |
| F. MVP-3 design | pending | Agent runtime, tool contracts, permissions, Vault mutation, provenance, rollback, and re-index loop are approved |
| G. MVP-3 implementation | pending | Agent can retrieve, create a reviewed note, trigger incremental indexing, and surface the new node with an auditable trace |

## Multi-Agent Coordination Rules

- Parallelize only independent research or disjoint write sets.
- Sub-agents do not commit, push, tag, merge, or alter shared planning files.
- `GestureEngine.ts`, public contracts, package manifests, and final integration remain owned by the main agent unless explicitly isolated.
- The main agent reviews license, maintenance health, security, API fit, code quality, tests, and full-suite behavior before accepting any third-party module or sub-agent patch.
- Open-source dependencies must be wrapped behind Auaka-owned adapters so they remain replaceable.

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
| Chinese design-document patch contained an invalid hunk line | 1 | Split the document into two smaller patches and verified the resulting file |
| PowerShell dynamic `Select-String` pattern check used an invalid positional argument | 1 | Re-ran the plan audit with literal pattern arguments and continued the self-review |
| GitHub publish blocked: no local origin, no accessible repositories, and `gh` CLI unavailable | 1 | Confirmed GitHub Connector identity; waiting for a repository target and/or local `gh` setup |
| Knowledge-galaxy planning patch used a stale insertion heading | 1 | Verified the patch was rejected atomically, inspected file tails, and split new plan creation from log updates |
| System/root Python environments lacked Pipeline test dependencies | 1 | Reused the existing dependency-complete MVP worktree virtual environment against the current source tree |
| Full Pipeline discovery spent over seven minutes compiling UMAP with no failure output | 1 | Interrupted the test-only process, ran 52 non-projection tests plus the projection metadata test; deterministic UMAP code was unchanged and remains a later isolated verification |

## 2026-08-20 — Hierarchical Knowledge Galaxy Program

**Goal:** Preserve persisted UMAP Semantic Space and add a deterministic multi-level Topic Galaxy driven by explicit hub notes, fallback assignment, animated dual-layout switching, and a collapsible rotating knowledge globe.

- Approved specification: `docs/superpowers/specs/2026-08-20-hierarchical-knowledge-galaxy-design.md`
- Implementation plan: `tasks/knowledge-galaxy-plan.md`
- Checklist: `tasks/knowledge-galaxy-todo.md`

| Phase | Status | Exit criterion |
|---|---|---|
| Galaxy 1. Versioned data foundation | in_progress | Artifact v2, v1 compatibility, and Frontmatter parsing pass review |
| Galaxy 2. Offline hierarchy/layout | pending | Hierarchy and persisted galaxy/compact coordinates are deterministic |
| Galaxy 3. Frontend dual layout | pending | Nodes and edges transition without jumps or identity loss |
| Galaxy 4. Toolbar/compact globe | pending | Collapse, rotation, pause/resume, and responsive UI pass |
| Galaxy 5. Real-data release gate | pending | Private preview, performance, review, and GitHub checks pass |

The user authorized direct execution after task breakdown. Parameter-level implementation decisions do not require an additional approval checkpoint.
