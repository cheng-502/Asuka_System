"""Command-line entry point for the offline knowledge pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import RuntimeConfig
from .chunks import ChunkingConfig
from .embeddings import load_sentence_transformer_embedder
from .generate import generate_from_vault
from .retrieval import RetrievalService, build_chunk_index, load_chunk_index
from .service import create_search_server
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
    generate_parser.add_argument("--min-similarity", type=float, default=0.60)
    generate_parser.add_argument(
        "--calibrate-similarity",
        action="store_true",
        help="emit unthresholded Top-K links for explicit calibration",
    )
    generate_parser.add_argument("--hierarchy-min-similarity", type=float, default=0.60)
    chunks_parser = subparsers.add_parser(
        "chunks", help="build or incrementally update the local chunk retrieval index"
    )
    chunks_parser.add_argument("--vault", type=Path, default=RuntimeConfig.from_env().vault_path)
    chunks_parser.add_argument(
        "--cache", type=Path, default=RuntimeConfig.from_env().chunk_index_path
    )
    chunks_parser.add_argument("--max-tokens", type=int, default=450)
    chunks_parser.add_argument("--overlap-tokens", type=int, default=50)
    serve_parser = subparsers.add_parser(
        "serve", help="serve the local chunk retrieval API on localhost"
    )
    serve_parser.add_argument(
        "--index", type=Path, default=RuntimeConfig.from_env().chunk_index_path
    )
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8765)
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
                min_similarity=None if args.calibrate_similarity else args.min_similarity,
                hierarchy_min_similarity=args.hierarchy_min_similarity,
            )
        except Exception as error:
            print(f"generation failed: {error}")
            return 1
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0

    if args.command == "chunks":
        try:
            config = RuntimeConfig.from_env()
            report = scan_vault(args.vault)
            if report.errors:
                messages = "; ".join(
                    f"{error.relative_path}: {error.message}" for error in report.errors
                )
                raise RuntimeError(f"Vault scan encountered read errors: {messages}")
            embedder = load_sentence_transformer_embedder(config.embedding_config)
            result = build_chunk_index(
                report.notes,
                embedder,
                cache_dir=args.cache,
                chunking_config=ChunkingConfig(
                    max_tokens=args.max_tokens, overlap_tokens=args.overlap_tokens
                ),
                embedding_config=config.embedding_config,
            )
        except Exception as error:
            print(f"chunk indexing failed: {error}")
            return 1
        payload = {
            "vault": str(report.root),
            "cache": str(args.cache),
            **result.report.to_dict(),
        }
        print(json.dumps(payload, ensure_ascii=True, indent=2))
        return 0

    if args.command == "serve":
        try:
            config = RuntimeConfig.from_env()
            index = load_chunk_index(args.index)
            embedder = load_sentence_transformer_embedder(config.embedding_config)
            server = create_search_server(
                service=RetrievalService(index, embedder),
                host=args.host,
                port=args.port,
            )
        except Exception as error:
            print(f"retrieval service failed to start: {error}")
            return 1
        print(f"Auaka retrieval service listening on http://{args.host}:{server.server_address[1]}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0

    print("Auaka System Knowledge Pipeline (MVP-1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
