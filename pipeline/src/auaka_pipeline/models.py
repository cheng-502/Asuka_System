"""Typed artifact boundary and JSON Schema validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, NotRequired, TypedDict

from jsonschema import Draft202012Validator, FormatChecker


DEFAULT_SCHEMA_PATH = (
    Path(__file__).resolve().parents[3] / "contracts" / "knowledge-space.schema.json"
)


class Position(TypedDict):
    x: float
    y: float
    z: float


class KnowledgeNode(TypedDict):
    id: str
    title: str
    summary: str
    domain: str
    position: Position
    explicit_link_count: int


class KnowledgeLink(TypedDict):
    source: str
    target: str
    types: list[str]
    similarity: NotRequired[float]
    is_unresolved: NotRequired[bool]
    unresolved_target: NotRequired[str]


class KnowledgeSpaceArtifact(TypedDict):
    version: int
    generated_at: str
    pipeline: dict[str, str]
    embedding: dict[str, Any]
    umap: dict[str, Any]
    source: dict[str, Any]
    nodes: list[KnowledgeNode]
    links: list[KnowledgeLink]


class ArtifactValidationError(ValueError):
    """Raised when an artifact fails schema or cross-record validation."""


def load_schema(schema_path: Path | None = None) -> dict[str, Any]:
    """Load and validate the canonical Draft 2020-12 schema."""

    path = schema_path or DEFAULT_SCHEMA_PATH
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return schema


def validate_artifact(
    artifact: Any, schema_path: Path | None = None
) -> KnowledgeSpaceArtifact:
    """Validate an artifact at the Pipeline boundary and return it unchanged."""

    schema = load_schema(schema_path)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(artifact), key=lambda error: list(error.path))
    if errors:
        details = "; ".join(
            f"{'.'.join(map(str, error.path)) or '<root>'}: {error.message}"
            for error in errors
        )
        raise ArtifactValidationError(details)

    node_ids = [node["id"] for node in artifact["nodes"]]
    if len(node_ids) != len(set(node_ids)):
        raise ArtifactValidationError("nodes: duplicate node id")

    known_nodes = set(node_ids)
    relation_errors: list[str] = []
    for index, link in enumerate(artifact["links"]):
        if link["source"] not in known_nodes:
            relation_errors.append(f"links[{index}].source: unknown node")
        if not link.get("is_unresolved", False) and link["target"] not in known_nodes:
            relation_errors.append(f"links[{index}].target: unknown resolved node")

    if relation_errors:
        raise ArtifactValidationError("; ".join(relation_errors))

    return artifact
