"""Typed artifact boundary and JSON Schema validation."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Literal, NotRequired, TypeAlias, TypedDict

from jsonschema import Draft202012Validator, FormatChecker


DEFAULT_SCHEMA_PATH = (
    Path(__file__).resolve().parents[3] / "contracts" / "knowledge-space.schema.json"
)


class Position(TypedDict):
    x: float
    y: float
    z: float


class KnowledgeNodeV1(TypedDict):
    id: str
    title: str
    summary: str
    domain: str
    position: Position
    explicit_link_count: int


class LayoutsV2(TypedDict):
    semantic: Position
    galaxy: Position
    compact: Position


class HierarchyV2(TypedDict):
    role: Literal["hub", "note"]
    parent_id: str | None
    depth: int
    assignment: Literal["explicit", "wikilink", "folder", "semantic", "unassigned"]
    topic_root_id: str


class KnowledgeNodeV2(TypedDict):
    id: str
    title: str
    summary: str
    domain: str
    layouts: LayoutsV2
    hierarchy: HierarchyV2
    explicit_link_count: int


class VirtualNodeV2(TypedDict):
    id: str
    title: str
    layouts: LayoutsV2
    hierarchy: HierarchyV2


class KnowledgeLink(TypedDict):
    source: str
    target: str
    types: list[str]
    similarity: NotRequired[float]
    is_unresolved: NotRequired[bool]
    unresolved_target: NotRequired[str]


class KnowledgeSpaceArtifactV1(TypedDict):
    version: Literal[1]
    generated_at: str
    pipeline: dict[str, str]
    embedding: dict[str, Any]
    umap: dict[str, Any]
    source: dict[str, Any]
    nodes: list[KnowledgeNodeV1]
    links: list[KnowledgeLink]


class KnowledgeSpaceArtifactV2(TypedDict):
    version: Literal[2]
    generated_at: str
    pipeline: dict[str, str]
    embedding: dict[str, Any]
    umap: dict[str, Any]
    layout_generation: dict[str, Any]
    source: dict[str, Any]
    nodes: list[KnowledgeNodeV2]
    virtual_nodes: list[VirtualNodeV2]
    links: list[KnowledgeLink]


KnowledgeNode: TypeAlias = KnowledgeNodeV1 | KnowledgeNodeV2
KnowledgeSpaceArtifact: TypeAlias = KnowledgeSpaceArtifactV1 | KnowledgeSpaceArtifactV2


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

    if artifact["version"] == 1:
        _validate_v1_records(artifact)
    else:
        _validate_v2_records(artifact)

    return artifact


def _validate_v1_records(artifact: KnowledgeSpaceArtifactV1) -> None:
    node_ids = [node["id"] for node in artifact["nodes"]]
    _require_unique(node_ids, "nodes: duplicate node id")
    if artifact["source"]["note_count"] != len(node_ids):
        raise ArtifactValidationError("source.note_count: does not match nodes")
    for index, node in enumerate(artifact["nodes"]):
        _validate_position(node["position"], f"nodes[{index}].position")
    _validate_links(artifact["links"], set(node_ids))


def _validate_v2_records(artifact: KnowledgeSpaceArtifactV2) -> None:
    real_ids = [node["id"] for node in artifact["nodes"]]
    virtual_ids = [node["id"] for node in artifact["virtual_nodes"]]
    _require_unique(real_ids + virtual_ids, "nodes: duplicate real or virtual node id")
    if artifact["source"]["note_count"] != len(real_ids):
        raise ArtifactValidationError("source.note_count: does not match real nodes")

    records = {
        node["id"]: node
        for node in [*artifact["nodes"], *artifact["virtual_nodes"]]
    }
    for collection_name, collection in (
        ("nodes", artifact["nodes"]),
        ("virtual_nodes", artifact["virtual_nodes"]),
    ):
        for index, node in enumerate(collection):
            for layout_name, position in node["layouts"].items():
                _validate_position(
                    position,
                    f"{collection_name}[{index}].layouts.{layout_name}",
                )

    for index, node in enumerate(artifact["virtual_nodes"]):
        hierarchy = node["hierarchy"]
        if (
            hierarchy["role"] != "hub"
            or hierarchy["parent_id"] is not None
            or hierarchy["depth"] != 0
            or hierarchy["assignment"] != "unassigned"
            or hierarchy["topic_root_id"] != node["id"]
        ):
            raise ArtifactValidationError(
                f"virtual_nodes[{index}].hierarchy: invalid virtual hub root"
            )

    unassigned_present = "virtual:unassigned" in records
    for index, node in enumerate(artifact["nodes"]):
        hierarchy = node["hierarchy"]
        parent_id = hierarchy["parent_id"]
        if hierarchy["role"] == "hub" and hierarchy["assignment"] != "explicit":
            raise ArtifactValidationError(
                f"nodes[{index}].hierarchy.assignment: hubs must be explicit"
            )
        if parent_id is None:
            if (
                hierarchy["role"] != "hub"
                or hierarchy["depth"] != 0
                or hierarchy["assignment"] != "explicit"
                or hierarchy["topic_root_id"] != node["id"]
            ):
                raise ArtifactValidationError(
                    f"nodes[{index}].hierarchy: invalid top-level hub"
                )
        else:
            parent = records.get(parent_id)
            if parent is None:
                raise ArtifactValidationError(
                    f"nodes[{index}].hierarchy.parent_id: unknown node"
                )
            if parent["hierarchy"]["role"] != "hub":
                raise ArtifactValidationError(
                    f"nodes[{index}].hierarchy.parent_id: parent is not a hub"
                )
            if hierarchy["depth"] != parent["hierarchy"]["depth"] + 1:
                raise ArtifactValidationError(
                    f"nodes[{index}].hierarchy.depth: inconsistent with parent"
                )

        if parent_id is not None and parent_id.startswith("virtual:"):
            if (
                hierarchy["role"] != "note"
                or hierarchy["assignment"] != "unassigned"
                or parent_id != "virtual:unassigned"
            ):
                raise ArtifactValidationError(
                    f"nodes[{index}].hierarchy: invalid unassigned parent"
                )
        elif hierarchy["assignment"] == "unassigned":
            raise ArtifactValidationError(
                f"nodes[{index}].hierarchy: unassigned node requires virtual parent"
            )

        if hierarchy["assignment"] == "unassigned" and not unassigned_present:
            raise ArtifactValidationError(
                f"nodes[{index}].hierarchy: missing virtual unassigned hub"
            )

    for node in artifact["nodes"]:
        root_id = _resolve_topic_root(node["id"], records)
        if node["hierarchy"]["topic_root_id"] != root_id:
            raise ArtifactValidationError(
                f"nodes[{node['id']}].hierarchy.topic_root_id: inconsistent root"
            )

    _validate_links(artifact["links"], set(real_ids))


def _resolve_topic_root(node_id: str, records: dict[str, Any]) -> str:
    visited: set[str] = set()
    current_id = node_id
    while True:
        if current_id in visited:
            raise ArtifactValidationError(f"nodes[{node_id}].hierarchy: parent cycle")
        visited.add(current_id)
        current = records[current_id]
        parent_id = current["hierarchy"]["parent_id"]
        if parent_id is None:
            return current_id
        if parent_id not in records:
            raise ArtifactValidationError(
                f"nodes[{node_id}].hierarchy.parent_id: unknown node"
            )
        current_id = parent_id


def _validate_links(links: list[KnowledgeLink], known_real_nodes: set[str]) -> None:
    errors: list[str] = []
    for index, link in enumerate(links):
        if link["source"].startswith("virtual:"):
            errors.append(f"links[{index}].source: virtual namespace is reserved")
        if link["target"].startswith("virtual:"):
            errors.append(f"links[{index}].target: virtual namespace is reserved")
        unresolved_target = link.get("unresolved_target")
        if unresolved_target is not None and unresolved_target.startswith("virtual:"):
            errors.append(
                f"links[{index}].unresolved_target: virtual namespace is reserved"
            )
        if link["source"] not in known_real_nodes:
            errors.append(f"links[{index}].source: unknown real node")
        if (
            not link.get("is_unresolved", False)
            and link["target"] not in known_real_nodes
        ):
            errors.append(f"links[{index}].target: unknown resolved real node")
    if errors:
        raise ArtifactValidationError("; ".join(errors))


def _validate_position(position: Position, path: str) -> None:
    try:
        is_finite = all(
            math.isfinite(float(position[axis])) for axis in ("x", "y", "z")
        )
    except (TypeError, ValueError, OverflowError):
        is_finite = False
    if not is_finite:
        raise ArtifactValidationError(f"{path}: coordinates must be finite")


def _require_unique(values: list[str], message: str) -> None:
    if len(values) != len(set(values)):
        raise ArtifactValidationError(message)
