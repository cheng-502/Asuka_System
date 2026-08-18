# MVP-1 Demo Runbook

This runbook starts the local-first MVP-1 demo: Obsidian Markdown → BAAI/bge-m3 note embeddings → UMAP 3D → Three.js → local Hand Landmarker → Pointer/Pinch/Open Palm.

## 1. Install

From the repository root:

```powershell
python -m pip install -e ".\pipeline[embedding]"
cd frontend
npm install
cd ..
```

The checked-in local assets are:

- `frontend/public/models/hand_landmarker.task`
- `frontend/public/wasm/`

The current validated model revision is `5617a9f61b028005a4858fdac845db406aefb181`.

## 2. Generate the real Vault artifact

The Vault is read-only. Generate private output outside Git:

```powershell
$env:AUAKA_MODEL_CACHE_PATH = "D:\1job\Auaka System\.worktrees\mvp1-implementation\pipeline\data\model-cache"
$env:HF_HUB_OFFLINE = "1"

python -m auaka_pipeline.cli generate `
  --vault "C:\Users\lin20\Desktop\广药文件\Obsidian Vault" `
  --artifact "data\knowledge-space.real.json" `
  --embedding-cache "data\embeddings" `
  --max-neighbors 5 `
  --min-similarity 0.60
```

Expected real-run summary: 351 notes, 575 unresolved Wikilinks, 1,426 total link records, 649 semantic records, UMAP `random_state=42`, and source hash `74ecb5820ea2c09b69e0fe9ae435f3f86ad0dc433cddd8821f6791da031d036c`.

To expose the private artifact to the local browser without replacing the checked-in fixture:

```powershell
Copy-Item data\knowledge-space.real.json frontend\public\data\knowledge-space.real.json -Force
```

## 3. Start the browser demo

```powershell
cd frontend
npx vite --host=127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/?artifact=/data/knowledge-space.real.json
```

The default URL without `?artifact=...` uses the checked-in two-note fixture.

## 4. Acceptance flow

1. Confirm the full-screen 3D scene loads and the camera preview is in the upper-left.
2. The scene should start from an angled external view centered on the node cloud. Use the mouse wheel to zoom in/out and drag to orbit/pan.
3. Without a camera, select nodes with the mouse; the detail panel should show the title and three tabs.
4. Click **Enable camera** and allow camera permission.
5. Extend the index finger and move it: the screen-space Pointer should move over nodes.
6. Hold index fingertip and thumb together for the stable pinch frames: the hovered node should select and expand its details.
7. Open the hand: Open Palm should clear selection and collapse the detail panel.
8. Move the hand out of frame: No Hand timeout should clear hover while mouse fallback remains available.
9. Use **Close camera · mouse mode** to stop tracking immediately and return to mouse-only interaction.
10. If no hand is detected for 15 seconds, the app automatically stops tracking and returns to mouse mode; the page and knowledge space remain open.

## Troubleshooting

- Model/WASM failure: confirm `/models/hand_landmarker.task` and `/wasm/` return HTTP 200 from Vite.
- Camera denied/unavailable: use mouse fallback; browser permission can be reset for `127.0.0.1`.
- Mouse mode: camera tracking never disables Three.js OrbitControls; use **Close camera · mouse mode** when you want to stop hand pointer events explicitly.
- Initial view: the scene computes its external camera target and distance from persisted node coordinates; reloading the same artifact does not recompute UMAP.
- Too many semantic edges: regenerate with a higher threshold; the first calibrated value is `0.60`.
- Nodes moved unexpectedly: compare the artifact `source.vault_hash`, embedding revision, and UMAP metadata before regenerating.
- Private data: do not commit `data/embeddings/`, `pipeline/data/model-cache/`, or `data/knowledge-space.real.json`.

MVP-2 features (voice, RAG, LLM, Agent, and Vault mutation) are intentionally not part of this runbook.
