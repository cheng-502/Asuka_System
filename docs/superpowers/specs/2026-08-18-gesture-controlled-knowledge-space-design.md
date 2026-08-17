# Gesture-Controlled Personal Knowledge Space — MVP-1 Design

**Status:** Architecture approved by user; awaiting written-spec review before implementation planning.

**Date:** 2026-08-18

## 1. Purpose

MVP-1 proves the distinctive core of Auaka System: a real Obsidian knowledge base becomes a semantic 3D space that can be explored and selected with hand gestures.

The first demo loop is:

```text
Hand enters camera view
  → index finger moves the screen pointer
  → pinch selects a glowing knowledge node
  → node expands
  → related knowledge becomes visible
```

This MVP is intentionally a spatial knowledge interface, not an assistant. It does not answer questions, retrieve chunks, call an LLM, or modify the Vault.

## 2. Scope

### In scope

- Obsidian Markdown notes from the configured Vault.
- Recursive Markdown ingestion with explicit exclusions.
- Local multilingual note-level embeddings.
- UMAP projection to 3D with a fixed random seed.
- Versioned `knowledge-space.json`.
- Three.js full-screen knowledge-space rendering.
- MediaPipe Hand Landmarker from a pinned local model asset.
- Gesture events: Pointer, Pinch, Open Palm, and No Hand.
- Screen-space pointer mapping and Three.js Raycaster selection.
- Node expansion with Summary, Wikilinks, and Semantic Neighbors tabs.
- Explicit Wikilink edges and inferred semantic-neighbor edges.

### Out of scope

- Chunk embeddings, Vector DB, RAG, LLM, voice, Hermes, or another Agent runtime.
- Automatic note creation or Vault mutation.
- Custom hardware, PCB, depth camera, or VR controller.
- A local API server for the first version.

## 3. Architecture Choice

Use a Python offline Knowledge Pipeline plus a Vite/TypeScript browser application.

```text
Python Knowledge Pipeline
  Obsidian Vault
    → Markdown Parser
    → Multilingual Note Embedding
    → UMAP 3D Projection
    → Semantic Neighbor Builder
    → Versioned knowledge-space.json

Browser Application
  knowledge-space.json → Three.js Scene
  Camera → MediaPipe Hand Landmarker
         → Gesture Engine
         → Pointer / Pinch / Open Palm Events
         → Three.js Interaction Controller
```

The browser never runs Embedding or UMAP. It loads a generated artifact and provides real-time visualization and interaction. This keeps the interaction loop responsive and makes offline computation reproducible.

### Alternatives rejected for MVP-1

1. **All-browser computation:** simpler deployment, but model loading, UMAP cost, memory pressure, and browser variability weaken the demo.
2. **Python local API plus browser:** extensible, but adds service startup, port management, request failure, and synchronization complexity before it is needed.

## 4. Component Boundaries

### Python Knowledge Pipeline

Responsibilities:

- Scan and filter the Vault.
- Parse note metadata, deterministic summary text, top-level domain, and Wikilinks.
- Generate multilingual note-level embeddings locally.
- Compute UMAP coordinates.
- Compute semantic-neighbor candidates and similarities.
- Compute the source Vault fingerprint.
- Write `knowledge-space.json` and local embedding cache files.
- Emit an indexing report for skipped or unresolved notes/links.

The Pipeline does not modify the Vault.

### Browser Data Layer

Responsibilities:

- Load `knowledge-space.json`.
- Validate the artifact schema at the boundary.
- Expose typed nodes and links to the scene layer.
- Convert malformed or missing relationship targets into safe non-rendering states rather than throwing through the render loop.

### Three.js Scene Layer

Responsibilities:

- Render the 3D scene and camera controls.
- Map node position to UMAP coordinates.
- Map domain to color, link count to node size, and focus to glow.
- Perform Raycaster hit testing.
- Render Wikilink and Semantic Link styles.
- Coordinate selected-node state with the detail panel.

### Hand Tracking and Gesture Engine

Responsibilities:

- Load the pinned local Hand Landmarker model.
- Convert landmarks into Pointer, Pinch, Open Palm, and No Hand states.
- Smooth Pointer coordinates.
- Apply stable-frame recognition, cooldown, and release-before-retrigger rules.
- Emit semantic events without importing or calling Three.js internals.

### Interaction Controller

Responsibilities:

- Consume Gesture Events.
- Convert normalized Pointer coordinates into a Three.js Raycaster query.
- Change hover, selection, and detail-panel state.
- Treat Open Palm as cancel/collapse.
- Keep the scene usable with mouse input when the camera is unavailable.

## 5. Vault Ingestion

Source Vault:

```text
C:\Users\lin20\Desktop\广药文件\Obsidian Vault
```

The current read-only inventory contains 387 Markdown files.

The parser recursively includes Markdown and excludes:

- `.obsidian/`
- `attachments/`, `img/`, and equivalent resource directories
- `templates/`
- Empty files
- `task_plan.md`, `findings.md`, and `progress.md`
- Other explicitly configured system or generated files

The exclusion list is configuration, not hard-coded behavior, so the same Pipeline can be used with another Vault.

### Note identity

For MVP-1, `note_id` is the normalized Vault-relative path using `/` separators. This keeps IDs inspectable and makes debugging from a node back to a file direct. A future version can add a frontmatter identifier without changing the rest of the artifact contract.

### Summary

The MVP summary is deterministic: use the first non-empty paragraph after frontmatter and trim it to a configured display length. No LLM is involved.

## 6. Embedding and Projection

### Embedding

- Target model: `BAAI/bge-m3` or the approved multilingual equivalent selected during implementation verification.
- Runtime: local Python `sentence-transformers` environment.
- Expected dimension for the selected BGE-M3 configuration: 1024.
- Similarity metric: cosine similarity over normalized vectors.
- The cross-language pair `目标检测` and `object detection` is a required sanity check.
- The browser never receives the complete embedding matrix.

### UMAP

- `n_components: 3`
- `random_state: 42`
- Metric aligned with the embedding similarity strategy.
- Coordinates are persisted and consumed as display coordinates only.
- MVP-1 does not promise absolute coordinate stability after data, model, UMAP, or Pipeline changes.

### Versioned artifact

The generated artifact stores computation context:

```json
{
  "version": 1,
  "generated_at": "2026-08-18T12:00:00Z",
  "pipeline": {
    "version": "mvp1.0.0"
  },
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimension": 1024,
    "metric": "cosine",
    "normalized": true
  },
  "umap": {
    "n_components": 3,
    "random_state": 42,
    "metric": "cosine"
  },
  "source": {
    "vault_hash": "...",
    "note_count": 387
  },
  "nodes": [],
  "links": []
}
```

The Vault hash is calculated from sorted included relative paths and their content hashes. A future layout change can therefore be attributed to the Vault, model, UMAP parameters, or Pipeline version.

### Separate embedding cache

```text
data/embeddings.npy
data/embedding-index.json
```

The cache retains high-dimensional vectors for recomputation and future MVP-2 retrieval work. It is not loaded by the browser and is not a substitute for the versioned display artifact.

## 7. Relationship Model

The data layer preserves two distinct relationship types:

- `wikilink`: explicit user-authored `[[...]]` relationship.
- `semantic`: model-inferred relationship with a similarity value.

If a pair has both types, one data record preserves both labels:

```json
{
  "source": "02_Wiki/目标检测.md",
  "target": "AI-Knowledge-Base/object-detection.md",
  "types": ["wikilink", "semantic"],
  "similarity": 0.86,
  "is_unresolved": false
}
```

Wikilinks are never deleted for visual reasons. Semantic neighbors are bounded by a configurable Top-K candidate policy and must also satisfy a similarity threshold. The threshold is calibrated after the first real Vault run instead of being assumed to be `0.7`.

Rendering rules:

- Solid line: Wikilink.
- Dashed line: Semantic Link.
- Both types on one pair: one visually merged edge with combined metadata.
- Unselected nodes: low-opacity/local relationship rendering.
- Selected node: full Wikilink neighborhood plus at most five threshold-qualified semantic links.

## 8. Gesture and Interaction Contract

```typescript
type GestureEvent =
  | {
      type: "pointermove";
      x: number;
      y: number;
      confidence: number;
      timestamp: number;
    }
  | {
      type: "pinchstart";
      x: number;
      y: number;
      confidence: number;
      timestamp: number;
    }
  | {
      type: "openpalm";
      confidence: number;
      timestamp: number;
    }
  | {
      type: "nohand";
      timestamp: number;
    };
```

Gesture meanings:

- Pointer: extended index finger controls the 2D screen pointer.
- Pinch: index finger and thumb pinch selects the node under the pointer.
- Open Palm: cancels selection and collapses details.
- No Hand: clears Pointer and Hover after a timeout.

Selection uses normalized fingertip coordinates and a Three.js Raycaster. Hand coordinates are not directly treated as Three.js world coordinates.

Initial tunable configuration:

```typescript
const gestureConfig = {
  pointerSmoothing: 0.25,
  pinchStableFrames: 5,
  pinchCooldownMs: 400,
  openPalmStableFrames: 8,
  noHandTimeoutMs: 600,
  semanticMaxNeighbors: 5
};
```

These values are initial calibration parameters, not irreversible protocol commitments.

## 9. Scene and Detail UI

Layout:

- Full-screen Three.js knowledge space.
- Small camera preview in the upper-left corner.
- Gesture status beside or below the camera preview.
- Selected-note detail panel placed so it does not obscure the main spatial view.

Node encoding:

- Position: UMAP 3D coordinate.
- Color: Obsidian top-level folder/domain.
- Size: explicit Wikilink count.
- Glow: Pointer hover or selected state.

Selected-node details:

- Title remains visible.
- `Summary` Tab: deterministic excerpt.
- `Wikilinks` Tab: explicit relationships.
- `Semantic Neighbors` Tab: threshold-qualified semantic relationships.

Interaction states:

```text
Browsing → Hovering       (Pointer hits a node)
Hovering → Browsing       (Pointer leaves a node)
Hovering → Selected       (PinchStart)
Selected → DetailTab      (Tab selection)
Selected/DetailTab → Browsing (OpenPalm)
Any active state → NoHand (NoHand timeout)
NoHand → Browsing         (hand detected)
```

## 10. Error Handling

### Pipeline

- A single malformed Markdown note is skipped and reported.
- Missing embedding model, embedding failure, or UMAP failure stops the Pipeline and does not replace the last valid artifact.
- An unresolved Wikilink is preserved as metadata and does not block generation.
- Artifact writing is atomic so a failed run cannot leave a partially written `knowledge-space.json`.

### Frontend

- Invalid artifact schema shows an actionable error state.
- Missing node targets do not crash the render loop.
- Missing camera permission disables gesture mode but leaves mouse-based 3D browsing available.
- Temporary tracking loss retains state briefly; timeout clears Pointer and Hover.

## 11. Verification Plan

### Pipeline checks

- Exclusion rules match the configured Vault policy.
- Note IDs and Vault hash are deterministic.
- `目标检测` and `object detection` pass the cross-language embedding sanity check.
- Re-running with unchanged input, model, UMAP parameters, and seed produces the same coordinates.
- Similarity distribution is exported for threshold calibration.
- Artifact schema validates before publication.
- Wikilink and Semantic Link types survive deduplication.

### Frontend checks

- Artifact loading and schema validation.
- Raycaster mapping from normalized Pointer coordinates.
- Gesture-event reducer and interaction state machine using synthetic events.
- Correct line styles and merged-edge metadata.
- Tab switching for Summary, Wikilinks, and Semantic Neighbors.
- Safe behavior for no camera, no hand, malformed data, and unresolved links.

### Manual demo acceptance

1. Load a generated artifact from the real Vault.
2. Confirm the 3D space contains the included notes and domain colors.
3. Confirm the camera preview and gesture state are visible in the upper-left.
4. Move the index finger and observe a smooth Pointer.
5. Pinch a node once and observe selection without repeated firing.
6. Inspect the three detail tabs.
7. Confirm Wikilink and Semantic Link rendering rules.
8. Open the palm and confirm collapse/cancel.
9. Temporarily remove the hand and confirm timeout behavior.
10. Re-run the Pipeline without source changes and confirm stable coordinates.

## 12. Future Compatibility

MVP-2 can add a separate Chunk Embedding → Vector DB → RAG path without changing the note-level display contract.

MVP-3 can add an Agent that creates or updates Obsidian notes, reruns the Pipeline, and makes new nodes appear in the space. The versioned artifact and source hash make those changes observable rather than mysterious.
