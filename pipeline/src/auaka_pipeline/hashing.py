"""Deterministic source hashing for artifact provenance."""

from __future__ import annotations

import hashlib
from collections.abc import Iterable

from .markdown import ParsedNote


def hash_notes(notes: Iterable[ParsedNote]) -> str:
    """Hash included note IDs and content hashes in canonical path order."""

    digest = hashlib.sha256()
    ordered = sorted(notes, key=lambda note: note.note_id.casefold())
    for note in ordered:
        _update_length_prefixed(digest, note.note_id)
        _update_length_prefixed(digest, note.content_hash)
    return digest.hexdigest()


def _update_length_prefixed(digest: hashlib._Hash, value: str) -> None:
    encoded = value.encode("utf-8")
    digest.update(len(encoded).to_bytes(8, "big"))
    digest.update(encoded)
