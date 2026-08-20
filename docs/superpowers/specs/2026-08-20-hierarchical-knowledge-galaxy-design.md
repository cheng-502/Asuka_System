# Auaka Hierarchical Knowledge Galaxy Design

**Date:** 2026-08-20  
**Status:** Approved design direction; awaiting written-spec review  
**Target:** Post–MVP-1.5 spatial visualization increment

## 1. Objective

Auaka will keep the existing UMAP-based semantic knowledge space and add a second, independently selectable Three.js view: **Hierarchical Knowledge Galaxy**.

The new view represents actual Markdown notes as a deterministic, multi-level galaxy:

- A real note declared as a topic hub acts as the center of a knowledge system.
- Child hub notes orbit their parent hub and form sub-galaxies.
- Ordinary notes orbit the nearest resolved hub.
- Explicit Wikilinks and inferred semantic relationships remain visible without redefining the hierarchy.
- Multiple top-level topic galaxies form one three-dimensional personal knowledge sphere.

The goal is not to replace vector semantics with folders. It is to let the user switch between two complementary mental models:

1. **Semantic Space:** persisted BGE-M3 → UMAP coordinates, optimized for semantic proximity.
2. **Topic Galaxy:** explicit and inferred hierarchy, optimized for browsing knowledge structure.

## 2. Scope

### Included

- Versioned hierarchy metadata in the generated knowledge Artifact.
- Frontmatter parsing for explicit hub and parent declarations.
- Deterministic fallback assignment for notes without explicit hierarchy.
- Multi-level galaxy layout with stable positions for unchanged inputs.
- Animated switching between Semantic Space and Topic Galaxy.
- Right-side vertical function toolbar with one implemented action.
- Collapse Topic Galaxy into a compact, slowly rotating globe and restore it.
- Preserve node selection, relationship rendering, mouse controls, and gesture interaction.
- Performance and reduced-motion behavior for the current 351-note Vault and the 100–1,000-note design range.

### Excluded

- Automatically writing or creating hub notes in the Obsidian Vault.
- LLM-generated folder or topic names.
- Voice, RAG, Agent actions, or full note-content reading.
- Replacing the persisted UMAP pipeline.
- General-purpose graph editing in the browser.

Richer note-content display remains a separate follow-up increment. This design only ensures that the existing detail panel can coexist with the new toolbar and that node selection continues to reach it.

## 3. Authoring Contract

Users declare intentional hierarchy in Markdown Frontmatter:

```yaml
---
knowledge_role: hub
knowledge_parent: "[[机器人视觉]]"
---
```

Rules:

- `knowledge_role: hub` declares that the note is a galaxy center.
- `knowledge_parent` declares the parent hub using an Obsidian Wikilink that the pipeline resolves to a stable Note ID.
- A top-level hub omits `knowledge_parent`.
- An ordinary note may declare `knowledge_parent` without declaring itself as a hub.
- Invalid or unresolved parent references produce a pipeline warning and fall through to automatic assignment.
- Parent cycles are rejected. All notes in the cycle fall through to automatic assignment and the Artifact records warnings.
- Auaka never creates or modifies Markdown files during this pipeline stage.

## 4. Hierarchy Resolution

Hierarchy assignment follows a strict precedence order:

1. **Explicit parent:** resolved `knowledge_parent`.
2. **Explicit Wikilink:** strongest direct link to a hub in the same folder subtree.
3. **Folder ancestry:** nearest hub found in the note's current or ancestor folder.
4. **Semantic fallback:** most similar hub above the calibrated semantic threshold.
5. **Unassigned:** a runtime-only “未归类” virtual hub, visually distinct and never written to the Vault.

Only explicit Frontmatter establishes hub-to-hub nesting. Automatic assignment may place ordinary notes beneath hubs but must not invent deeper hub levels or mutate the author's intended hierarchy.

When multiple candidates tie, deterministic Note ID ordering breaks the tie. This prevents layout changes between identical pipeline runs.

## 5. Artifact Contract

The schema changes are incompatible with the current strict v1 node schema, so the pipeline emits **Artifact version 2**. Existing v1 fixtures remain supported by the frontend and receive a derived single-level fallback hierarchy at load time.

Each real node gains:

```json
{
  "hierarchy": {
    "role": "hub",
    "parent_id": "机器人视觉.md",
    "depth": 2,
    "assignment": "explicit",
    "topic_root_id": "知识空间.md"
  },
  "layouts": {
    "semantic": { "x": 0.1, "y": -0.2, "z": 0.3 },
    "galaxy": { "x": 1.4, "y": 0.8, "z": -0.6 },
    "compact": { "x": 0.2, "y": 0.3, "z": 0.1 }
  }
}
```

Constraints:

- `role` is `hub` or `note` for real notes.
- `parent_id` is null only for top-level hubs.
- `depth` is derived and validated by the pipeline.
- `assignment` is `explicit`, `wikilink`, `folder`, `semantic`, or `unassigned`.
- `topic_root_id` points to the top-level hub containing the node.
- `semantic` remains the persisted UMAP coordinate; no UMAP runs in the browser.
- `galaxy` and `compact` are calculated offline and persisted for reproducibility.
- Virtual fallback hubs live in a separate `virtual_nodes` collection and cannot collide with real Note IDs.
- Layout parameters and algorithm version are stored in Artifact metadata.

## 6. Deterministic Galaxy Layout

The offline pipeline calculates three target positions per node.

### 6.1 Global structure

- The conceptual personal knowledge-space root is at the scene origin.
- Top-level hubs receive stable directions on a Fibonacci sphere.
- Direction ordering is based on stable Note ID hash, not filesystem enumeration order.
- Top-level radius expands with hub count to prevent galaxy overlap.

### 6.2 Nested hubs

- Child hubs sit on an orbital shell around their parent.
- Each parent receives a local tangent frame derived from its direction from the root.
- Golden-angle placement distributes sibling hubs in that local orbital plane.
- Orbital radius depends on sibling count and subtree size.
- The same rule recurses for arbitrary declared hierarchy depth.

### 6.3 Ordinary notes

- Ordinary notes form one or more orbital shells around their assigned hub.
- Golden-angle placement avoids regular rows and reduces overlap.
- Shell radius grows with note count and node-render radius.
- A deterministic semantic offset uses the node's normalized UMAP displacement from its sibling centroid, projected into the parent's local tangent frame and capped at 15% of the orbital radius. This keeps related siblings nearer without overriding hierarchy.

### 6.4 Compact globe

- Compact coordinates place all real nodes on deterministic Fibonacci shells around the origin.
- Hub nodes occupy slightly inner shells and ordinary notes occupy outer shells.
- The conceptual root stays at the origin.
- During collapse, nonselected edges become hidden. If a node is selected, only its parent path, direct children, Wikilinks, and qualified Top-5 semantic neighbors remain visible at reduced opacity.

This is a calculated layout, not a continuously running force simulation. The browser consumes stable targets and only performs visual interpolation.

## 7. Relationship Rendering

Hierarchy and knowledge relationships are separate concepts:

- **Hierarchy edge:** parent hub to child hub or note; thin solid line using the topic color.
- **Wikilink:** user-authored relationship; solid line.
- **Semantic link:** model-inferred relationship; dashed line with similarity metadata.
- If Wikilink and semantic types overlap, the visual layer merges them as already specified while the data layer retains both.
- Hierarchy edges do not replace or delete Wikilinks.

Density policy:

- Idle view shows hierarchy edges at low opacity.
- Cross-topic Wikilinks and semantic edges remain hidden or very faint until their endpoint is selected.
- Selecting a node highlights its parent path, immediate children, complete Wikilink neighborhood, and qualified Top-5 semantic neighborhood.
- Level-of-detail hides ordinary-note labels at distant camera ranges while keeping hub labels visible.

## 8. Interaction and Animation

### 8.1 View switching

A compact top-center segmented control switches between **语义空间** and **主题星系**.

- Selection and hover identity persist across modes.
- Nodes interpolate from their current rendered position to the target layout.
- Edges update during the transition without rebuilding the whole scene each frame.
- Default transition duration is 800 ms with a smooth cubic ease-in-out.
- Camera target eases to the selected layout's persisted bounds.
- Repeated clicks during a transition retarget from the current interpolated positions rather than restarting from stale coordinates.

### 8.2 Right function toolbar

- A narrow vertical toolbar is fixed at the center-right edge.
- The existing detail panel shifts left of the toolbar so the two never overlap.
- Empty future slots are visibly reserved but disabled and removed from keyboard focus.
- The first button is labeled **收拢为知识球** / **展开主题星系** according to state.

### 8.3 Collapse and rotation

- Collapse is available only in Topic Galaxy mode.
- Nodes interpolate to persisted compact coordinates over 900 ms.
- Nonessential labels and edges fade while positions move.
- After collapse completes, the entire knowledge group rotates around its vertical axis at `0.035 rad/s`.
- Mouse drag, mouse wheel, hand transform, or node selection pauses automatic rotation immediately.
- Rotation resumes two seconds after interaction ends while the compact state remains active.
- Expanding stops automatic rotation and restores the hierarchical galaxy targets and edge visibility.

### 8.4 Reduced motion

When `prefers-reduced-motion: reduce` is active:

- Layout switches complete without position tweening.
- Automatic globe rotation is disabled.
- Selection and view state remain fully usable.

## 9. Component Boundaries

The implementation introduces focused modules rather than extending `KnowledgeScene` with all layout logic:

- `KnowledgeLayoutState`: semantic, galaxy, compact state and transition target.
- `LayoutTransitionController`: frame-time interpolation and interruption-safe retargeting.
- `KnowledgeGalaxyToolbar`: accessible view switch and right-side toolbar events.
- `GalaxyLayout` pipeline module: hierarchy resolution and deterministic offline coordinates.
- `KnowledgeScene`: consumes target positions, updates render buffers, preserves picking and camera ownership.
- `RelationshipVisibility`: decides which hierarchy/Wikilink/semantic edges are visible for the current state and selection.

No new frontend state-management library or animation dependency is required.

## 10. Performance Requirements

Targets are measured with the real 351-note Artifact and stress fixtures at 1,000 notes:

- Desktop target: 60 FPS during idle orbit and layout transition on the development machine.
- Acceptance floor: 30 FPS at 1,000 nodes during transition.
- No per-frame object allocation proportional to node count after initialization.
- Reuse typed position buffers and edge geometries.
- Pixel ratio remains capped at 2.
- Picking uses the existing raycaster initially; spatial acceleration is introduced only if profiling shows a bottleneck.
- Automatic rotation stops when the page is hidden.

## 11. Failure Handling

- v1 Artifact: load Semantic Space normally and derive a deterministic one-level Topic Galaxy from Note ID folders.
- Invalid hierarchy metadata: reject invalid v2 Artifact during schema validation.
- Unresolved parent or cycle: pipeline warning plus deterministic fallback assignment.
- Empty Vault: render an empty-state message; toolbar actions remain disabled.
- One top-level hub: center it and distribute descendants without forcing an artificial global sphere.
- Missing semantic fallback candidate: use the virtual “未归类” hub.

## 12. Testing and Acceptance

### Pipeline tests

- Parse explicit hub and parent Frontmatter.
- Resolve parent Wikilinks to stable Note IDs.
- Detect unresolved parents and cycles.
- Verify precedence across explicit, Wikilink, folder, semantic, and unassigned rules.
- Verify deterministic hierarchy and coordinates under shuffled filesystem order.
- Validate Artifact v2 and retain v1 compatibility fixtures.
- Verify arbitrary hub nesting depth without recursion overflow.

### Frontend unit tests

- Switch semantic ↔ galaxy without losing selection.
- Interrupt and reverse an in-progress transition without jumps.
- Collapse and restore exact target coordinates.
- Pause/resume rotation on mouse, hand, and selection input.
- Respect reduced-motion preferences.
- Keep toolbar and detail panel states synchronized.
- Preserve hierarchy, Wikilink, and semantic edge-type behavior.

### Browser acceptance

- Real 351-note Artifact opens in both views.
- Topic Galaxy visibly contains multiple top-level hubs, nested sub-hubs, and ordinary-note satellites.
- Selecting a hub reveals its parent path and local neighborhood.
- Collapse produces a centered compact globe and smooth Earth-like rotation.
- Expand restores the same hierarchy without node identity changes.
- Mouse and camera/gesture controls remain functional.
- Toolbar does not overlap the detail panel at desktop and narrow layouts.

## 13. Delivery Slices

1. Artifact v2 hierarchy contract and deterministic hierarchy resolution.
2. Offline galaxy and compact coordinate generation.
3. Frontend dual-layout state and transition controller.
4. Hierarchy relationship rendering and level-of-detail.
5. Right toolbar, collapse/expand, and automatic rotation.
6. Real-Artifact browser verification, profiling, documentation, review, and release decision.

Each slice must keep Semantic Space operational and pass existing mouse/gesture regressions.
