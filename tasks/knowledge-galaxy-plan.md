# Implementation Plan: Hierarchical Knowledge Galaxy

## Overview

Implement the approved dual-view visualization while preserving persisted UMAP Semantic Space, stable Note IDs, current mouse/gesture behavior, and the private real-Artifact policy. Delivery is contract-first: Artifact v2 compatibility, hierarchy parsing/resolution, deterministic offline layouts, animated Three.js transitions, relationship visibility, controls, compact rotation, then real-Vault verification.

## Architecture Decisions

- Semantic Space and Topic Galaxy are independent layouts over the same nodes.
- Pipeline emits Artifact v2; frontend dual-reads v1/v2 and normalizes them to one runtime model.
- Hierarchy precedence is explicit parent → Wikilink → folder → semantic → unassigned.
- Semantic, galaxy, and compact coordinates are persisted; the browser runs no UMAP, hierarchy placement, or force simulation.
- Layout transition, relationship visibility, toolbar, and auto-rotation are focused modules owned by Auaka.
- No new frontend animation or state-management dependency.
- Every production behavior follows RED → GREEN → refactor and each verified slice gets an atomic commit.

## Dependency Graph

```text
1a strict v2 wire contract + Python validation
├─ 1b frontend v1/v2 normalization
└─ 2 Frontmatter hierarchy
│  └─ 3 hierarchy resolver
│     └─ 4 galaxy/compact layouts
│        └─ 5 pipeline v2 integration
└─ 6 frontend transition model
   └─ 7 dynamic edges/visibility
      └─ 8 dual-view toolbar
         └─ 9 compact rotation/ownership
            └─ 10 real-data release gate
```

## Phase 1: Versioned Data Foundation

### Task 1a: Strict Artifact v2 wire contract and Python validation

**Description:** Preserve v1 as an independent strict schema branch and add a discriminated strict v2 branch plus Python cross-record validation. Pipeline output remains v1 until Task 5.

**Acceptance criteria:**

- Root schema uses `oneOf` discriminated by exact `version`; v2 cannot omit hierarchy or layouts.
- Wire v2 stores `layouts.semantic` as the only semantic coordinate source; hierarchy edges derive from `parent_id`, never duplicate into `links`.
- Real and `virtual:` IDs are globally unique; note count, hub parent, root/depth, topic root, unassigned, cycle, link-target, and finite-coordinate invariants are enforced.
- Artifact, pipeline, and `layout_generation` algorithm versions remain separate.

**Verification:** RED/GREEN Python model/artifact tests using shared valid/invalid v1/v2 JSON fixtures.

**Dependencies:** None

**Files likely touched:** strict schema, shared fixtures, Python models and artifact tests.

**Scope:** M

### Task 1b: Frontend wire/runtime normalization and v1 compatibility

**Description:** Separate `ArtifactV1Wire | ArtifactV2Wire` from one `RuntimeKnowledgeSpace` consumed by scene/UI modules.

**Acceptance criteria:**

- Load path is parse → strict schema validation → cross-record validation → normalization.
- v2 runtime uses `layouts.semantic` as `position` and exposes galaxy/compact capability.
- v1 preserves semantic positions, maps all runtime targets to that position, sets `capabilities.hierarchy=false`, and disables Topic Galaxy rather than calculating layout in the browser.
- Python and frontend execute the same shared valid/invalid fixture corpus.

**Verification:** RED/GREEN frontend validation/loading tests, then TypeScript typecheck.

**Dependencies:** Task 1a

**Files likely touched:** frontend data types, validation/loading modules, and tests.

**Scope:** M

### Task 2: Explicit hierarchy Frontmatter parsing

**Description:** Parse `knowledge_role` and `knowledge_parent` through the existing safe scalar parser.

**Acceptance criteria:**

- Hub role and quoted/unquoted parent Wikilinks parse deterministically.
- Invalid metadata cannot execute YAML and does not alter existing title/summary/link parsing.
- Source metadata retains enough information for later stable Note ID resolution.

**Verification:** RED/GREEN focused Markdown tests, then `python -m pytest pipeline/tests/test_vault.py pipeline/tests/test_chunks.py`.

**Dependencies:** Task 1a

**Files likely touched:** `pipeline/src/auaka_pipeline/markdown.py`, parser/Vault tests.

**Scope:** S

### Checkpoint A

- Task 1a/1b contract tests, parser tests, frontend loader tests, and typecheck pass.
- Independent spec review approves v1/v2 migration and authoring behavior.

## Phase 2: Offline Hierarchy and Layouts

### Task 3: Deterministic multi-level hierarchy resolver

**Description:** Implement pure precedence resolution with cycle/unresolved-parent handling.

**Acceptance criteria:**

- Explicit nesting yields correct parent, depth, and topic root; ordinary-note fallback never invents hub-to-hub levels.
- Wikilink candidates are restricted to the same folder subtree; folder fallback chooses the nearest ancestor-folder hub.
- Semantic candidates must meet the calibrated threshold; no candidate enters `virtual:unassigned`.
- Note ID ordering breaks ties; cycles/unresolved parents warn and fall back; deep chains use bounded iterative traversal.
- Input-order shuffling does not change assignments.

**Verification:** RED/GREEN `python -m pytest pipeline/tests/test_hierarchy.py`, including shuffled-order and cycle cases.

**Dependencies:** Task 2

**Files likely touched:** new `hierarchy.py`, new hierarchy tests, relationship integration.

**Scope:** M

### Task 4: Deterministic galaxy and compact coordinates

**Description:** Implement recursive Fibonacci/golden-angle placement and capped sibling-local UMAP displacement.

**Acceptance criteria:**

- Identical inputs produce byte-stable finite positions independent of input order.
- Nested hubs, large sibling sets, deep hierarchies, and unassigned nodes remain bounded; a single top-level hub is placed at the galaxy origin.
- Compact targets form deterministic shells around the conceptual root.

**Verification:** RED/GREEN `python -m pytest pipeline/tests/test_galaxy_layout.py`.

**Dependencies:** Task 3

**Files likely touched:** new `galaxy_layout.py`, new layout tests, projection integration.

**Scope:** M

### Task 5: Publish Artifact v2 atomically

**Description:** Integrate hierarchy/layout output into generation, CLI reporting, and version metadata.

**Acceptance criteria:**

- `generate` atomically emits schema-valid v2 with all layouts.
- Embedding cache, Vault hash, UMAP seed, threshold, and read-only Vault guarantees remain intact.
- CLI reports assignment counts and safe hierarchy warnings.

**Verification:** RED/GREEN artifact/CLI/projection tests, then full Python suite.

**Dependencies:** Task 4

**Files likely touched:** pipeline artifact/generate/CLI modules and tests.

**Scope:** M

### Checkpoint B

- Full Python suite passes.
- Repeated fixture generation differs only in `generated_at`.
- Independent quality review approves determinism, validation, cycle safety, and Vault privacy.

## Phase 3: Frontend Dual Layout

### Task 6: Interruption-safe layout state and transitions

**Description:** Add semantic/galaxy state and a generic timestamp-based retargetable interpolation controller. Compact state is introduced by Task 9a using the same controller.

**Acceptance criteria:**

- Switch, reverse, and interrupt the 800 ms transition without jumps; nodes finish at persisted targets and the camera finishes at bounds deterministically derived from those coordinates.
- Selection and hover identity survive every transition.
- Reduced motion applies targets immediately.

**Verification:** RED/GREEN transition-controller tests plus scene integration tests.

**Dependencies:** Task 1b; final integration consumes Task 5 output.

**Files likely touched:** new layout-state/transition modules, `KnowledgeScene.ts`, scene tests.

**Scope:** M

### Task 7: Dynamic edges and relationship visibility

**Description:** Reuse mutable edge buffers during movement and implement state/selection density rules.

**Acceptance criteria:**

- Edges remain attached without per-frame Three.js object recreation.
- Distant ordinary-note labels hide while hub labels remain visible.
- Idle mode shows low-opacity hierarchy only; selection shows parent path, direct children, complete Wikilinks, and qualified Top-5 semantic links.
- The visibility module defines compact policy—hide nonselected edges and retain the selected neighborhood at reduced opacity—for Task 9a to activate.
- Hierarchy, Wikilink, semantic, and merged relationships remain distinguishable.

**Verification:** RED/GREEN edge/visibility/scene tests, including geometry-reuse assertions.

**Dependencies:** Task 6

**Files likely touched:** `edges.ts`, new visibility module, `KnowledgeScene.ts`, tests.

**Scope:** M

### Checkpoint C

- Frontend suite, typecheck, build, and browser transition smoke pass.
- Independent review checks per-frame allocation and Three.js disposal.

## Phase 4: Controls and Compact Globe

### Task 8: Dual-view control and right toolbar

**Description:** Add accessible view switching and a reserved vertical toolbar with collapse as its first action.

**Acceptance criteria:**

- Task 8 renders Collapse as disabled until Task 9a connects the complete behavior; v1 and empty Vault keep it disabled permanently.
- Virtual `unassigned` hub is visually distinct and cannot collide with real IDs.
- Controls expose correct pressed/disabled state.
- Empty slots are visible, disabled, and removed from keyboard focus.
- Detail panel shifts left and does not overlap at 320/768/1024/1440 px.
- Empty Vault shows an explicit empty-state message instead of a blank scene.

**Verification:** RED/GREEN toolbar tests and responsive browser checks.

**Dependencies:** Task 7

**Files likely touched:** new toolbar UI, `main.ts`, `style.css`, UI tests.

**Scope:** M

### Task 9a: Compact collapse/expand transition

**Description:** Add the compact layout state and its independent 900 ms collapse/expand transition.

**Acceptance criteria:**

- Collapse is available only in Topic Galaxy and reaches exact compact targets in 900 ms.
- Task 9a enables the previously disabled toolbar action only when hierarchy capability and nonempty data are present.
- Expanding restores exact galaxy targets and relationship visibility.
- Nonessential labels and edges interpolate to compact opacity during collapse and restore during expansion.
- Transition reversal retargets from current positions; reduced motion applies instantly.

**Verification:** RED/GREEN fake-clock compact-transition tests plus scene integration.

**Dependencies:** Task 8

**Files likely touched:** layout state/transition modules, scene module, compact-transition tests.

**Scope:** M

### Task 9b: Rotation scheduler and interaction ownership

**Description:** Start rotation only after collapse and coordinate pause/resume with mouse, hand, selection, page visibility, and reduced motion.

**Acceptance criteria:**

- Compact group rotates at `0.035 rad/s` only after transition completion.
- Mouse drag/wheel, hand transform, selection, or hidden page pause immediately; eligible idle state resumes after 2 seconds.
- Reduced motion disables rotation, hidden pages perform no rotation work, and OrbitControls never fights group rotation.

**Verification:** RED/GREEN fake-clock scheduler/ownership tests; all existing gesture/mouse suites remain green.

**Dependencies:** Task 9a

**Files likely touched:** new auto-rotation controller, scene/interaction modules, and tests.

**Scope:** M

## Phase 5: Real Data and Release Gate

### Task 10: Real 351-note Artifact, profile, review, and documentation

**Description:** Run a read-only hierarchy preflight, generate private v2 data, run fixture/real browser acceptance and measured performance checks, then close release gates.

**Acceptance criteria:**

- Preflight reports explicit hub/parent counts without note content. The current baseline is 0/0, so nested-hub visual acceptance uses a deterministic fixture until the user adds Frontmatter.
- Real v2 validates, remains ignored/private, and accurately shows fallback/unassigned structure without pretending inferred notes are explicit hubs.
- Fixture and real views preserve selection/details/mouse/camera behavior; fixture verifies multiple nested hubs and compact mode.
- On the development machine, a 10-second post-warmup sample targets 60 FPS for 351 nodes and must remain at or above 30 FPS for 1,000 nodes during transition.
- Profiler/allocation instrumentation confirms no O(N) object creation per animation frame after initialization.

**Verification:** Full Python/frontend suites, typecheck, build, diff-check, private-file audit, browser console/runtime inspection, specification review, and quality review.

**Dependencies:** Tasks 5 and 9b

**Files likely touched:** README/progress/todo plus ignored local real Artifact.

**Scope:** M

### Checkpoint D

- Every acceptance criterion is satisfied.
- No real Vault data is staged or pushed.
- Branch contains atomic reviewed commits and is pushed to GitHub.
- User can inspect the completed Topic Galaxy locally.

## Parallelization

- Main agent owns schema/public contracts, integration, Git, and final decisions.
- Review agents may independently audit Python/frontend contract consistency after Task 1.
- Tasks 3–5 are sequential because they share hierarchy output.
- Tasks 6–9 are sequential because they share scene lifecycle.
- Independent spec and quality reviews run at Checkpoints A–D.
- Documentation/performance fixture preparation may run beside final browser verification with disjoint writes.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| v2 breaks current preview | High | Dual-version loader lands before pipeline output changes |
| Ambiguous hierarchy moves nodes | High | Strict precedence, stable tie-breaks, order tests |
| Parent cycles recurse | High | Iterative cycle detection and deep-chain tests |
| Edges detach during animation | High | Reused mutable edge buffers |
| Animation fights controls | High | Explicit interruption/ownership controllers |
| 1,000 nodes allocate per frame | Medium | Typed buffers and profiling before optimization |
| Private data enters Git | High | Existing ignore rule and staged-file audit |

## Open Questions

None. The user approved the specification and authorized direct execution after planning.
