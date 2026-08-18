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
