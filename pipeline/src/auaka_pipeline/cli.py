"""Command-line entry point for the offline knowledge pipeline."""

from __future__ import annotations

import argparse


def main(argv: list[str] | None = None) -> int:
    """Run the placeholder pipeline command until indexing is implemented."""

    parser = argparse.ArgumentParser(
        description="Auaka System offline knowledge-space pipeline"
    )
    parser.parse_args(argv)
    print("Auaka System Knowledge Pipeline (MVP-1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
