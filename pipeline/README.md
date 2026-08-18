# Auaka Knowledge Pipeline

The offline Pipeline reads the configured Obsidian Vault and will eventually
generate the versioned knowledge-space artifact. Task 3 provides a read-only
Markdown scanner and structured indexing report; embedding and projection are
implemented in later tasks.

```powershell
python -m pip install -e .
auaka-pipeline
```

Configuration is read from `AUAKA_VAULT_PATH` and `AUAKA_HAND_MODEL_PATH`.

To inspect a Vault without writing to it:

```powershell
auaka-pipeline scan --vault "C:\path\to\Obsidian Vault"
```

The command prints JSON-safe counts for included notes, exclusions, unresolved
Wikilinks, and read errors.
