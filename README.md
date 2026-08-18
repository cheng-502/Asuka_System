# Auaka System

Auaka System is a local-first multimodal personal knowledge-space project.
MVP-1 maps an Obsidian Markdown Vault into a semantic 3D space and adds
screen-space hand interaction through Pointer, Pinch, and Open Palm gestures.

## Task 1 local setup

Python Pipeline:

```powershell
python -m pip install -e pipeline
auaka-pipeline
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

The Vault and local Hand Landmarker model are configured through environment
variables. Generated vectors, private artifacts, environment files, and build
outputs are excluded by `.gitignore`.

For the real 351-note Vault generation and gesture acceptance flow, see
[`docs/demo-runbook.md`](docs/demo-runbook.md).

## MVP-2A local chunk retrieval

MVP-2A adds a separate retrieval path. It chunks Markdown by headings and
paragraphs, embeds chunks with the same local multilingual model, and stores
the high-dimensional vectors outside `knowledge-space.json`. UMAP coordinates
are never used for search.

Build or incrementally update the local exact-cosine index:

```powershell
auaka-pipeline chunks `
  --vault "C:\Users\lin20\Desktop\广药文件\Obsidian Vault" `
  --cache "data\chunks"
```

Start the localhost API:

```powershell
auaka-pipeline serve --index "data\chunks" --host 127.0.0.1 --port 8765
```

Query it with `POST /search`:

```powershell
curl.exe -X POST http://127.0.0.1:8765/search `
  -H "Content-Type: application/json" `
  -d '{"query":"手眼标定","top_k":5,"min_score":0.60}'
```

The index cache contains `chunk-vectors.npy` and `chunk-index.json`. Re-running
the command reuses vectors whose `chunk_id`, content hash, model/revision, and
chunking configuration are unchanged. Voice, LLM/RAG answer generation,
Agent actions, and Vault writes remain outside MVP-2A.
