"""Command-line entry point for the offline knowledge pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import RuntimeConfig
from .generate import generate_from_vault
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
    generate_parser = subparsers.add_parser(
        "generate", help="generate the validated browser artifact from a Vault"
    )
    generate_parser.add_argument("--vault", type=Path, default=RuntimeConfig.from_env().vault_path)
    generate_parser.add_argument(
        "--artifact", type=Path, default=Path("frontend/public/data/knowledge-space.json")
    )
    generate_parser.add_argument("--embedding-cache", type=Path, default=Path("data/embeddings"))
    generate_parser.add_argument("--max-neighbors", type=int, default=5)
    generate_parser.add_argument("--min-similarity", type=float, default=None)
    args = parser.parse_args(argv)

    if args.command == "scan":
        report = scan_vault(args.vault)
        print(json.dumps(indexing_report(report), ensure_ascii=True, indent=2))
        return 0

    if args.command == "generate":
        try:
            result = generate_from_vault(
                vault_path=args.vault,
                artifact_path=args.artifact,
                embedding_cache_path=args.embedding_cache,
                max_neighbors=args.max_neighbors,
                min_similarity=args.min_similarity,
            )
        except Exception as error:
            print(f"generation failed: {error}")
            return 1
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0

    print("Auaka System Knowledge Pipeline (MVP-1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
