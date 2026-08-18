# Auaka Knowledge Pipeline

The offline Pipeline will read the configured Obsidian Vault and generate the
versioned knowledge-space artifact. Task 1 only provides the installable package
and placeholder CLI.

```powershell
python -m pip install -e .
auaka-pipeline
```

Configuration is read from `AUAKA_VAULT_PATH` and `AUAKA_HAND_MODEL_PATH`.
