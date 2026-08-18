"""Command-line entry point for the offline knowledge pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import RuntimeConfig
from .vault import indexing_report, scan_vault


def main(argv: list[str] | None = None) -> int:
    """Run the placeholder pipeline command until indexing is implemented."""

    parser = argparse.ArgumentParser(description="Auaka System offline knowledge-space pipeline")
    subparsers = parser.add_subparsers(dest="command")
    scan_parser = subparsers.add_parser("scan", help="scan a Vault and print a read-only report")
    scan_parser.add_argument(
        "--vault",
        type=Path,
        default=RuntimeConfig.from_env().vault_path,
        help="Obsidian Vault root; defaults to AUAKA_VAULT_PATH",
    )
    args = parser.parse_args(argv)

    if args.command == "scan":
        report = scan_vault(args.vault)
        print(json.dumps(indexing_report(report), ensure_ascii=True, indent=2))
        return 0

    print("Auaka System Knowledge Pipeline (MVP-1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
