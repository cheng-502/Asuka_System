# Auaka Knowledge Pipeline

The offline Pipeline reads the configured Obsidian Vault and will eventually
generate the versioned knowledge-space artifact. Task 3 provides a read-only
Markdown scanner and structured indexing report; embedding and projection are
implemented in later tasks.

```powershell
python -m pip install -e .
auaka-pipeline
```

Configuration is read from the `AUAKA_VAULT_PATH`, `AUAKA_HAND_MODEL_PATH`,
`AUAKA_EMBEDDING_MODEL`, `AUAKA_EMBEDDING_DIMENSION`,
`AUAKA_EMBEDDING_DEVICE`, and `AUAKA_MODEL_CACHE_PATH` environment variables.

The default multilingual model is `BAAI/bge-m3`. Install the optional local
model runtime only when running real embeddings:

```powershell
python -m pip install -e ".[embedding]"
```

Unit tests use a deterministic fake embedder, so they do not download a model.
High-dimensional vectors are stored under the embedding cache directory and
are not included in `knowledge-space.json`.

To inspect a Vault without writing to it:

```powershell
auaka-pipeline scan --vault "C:\path\to\Obsidian Vault"
```

The command prints JSON-safe counts for included notes, exclusions, unresolved
Wikilinks, and read errors.
