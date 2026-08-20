"""Deterministic offline coordinates for topic-galaxy and compact views."""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .hierarchy import HierarchyRecord, UNASSIGNED_HUB_ID


Point3 = tuple[float, float, float]
GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))
NODE_SPACING = 0.42
SEMANTIC_OFFSET_RATIO = 0.15
DEPTH_DECAY_CONSTANT = 10.0
ALGORITHM_VERSION = "galaxy-layout-v1"


@dataclass(frozen=True, slots=True)
class GalaxyLayoutConfig:
    seed: int = 42

    def __post_init__(self) -> None:
        if not isinstance(self.seed, int) or isinstance(self.seed, bool):
            raise ValueError("seed must be an integer")

    def artifact_metadata(self) -> dict[str, object]:
        return {
            "version": ALGORITHM_VERSION,
            "galaxy": {"algorithm": "fibonacci-orbit", "seed": self.seed},
            "compact": {"algorithm": "fibonacci-shell", "seed": self.seed},
        }


@dataclass(frozen=True, slots=True)
class GalaxyLayoutResult:
    galaxy: dict[str, Point3]
    compact: dict[str, Point3]
    metadata: dict[str, object]


def generate_galaxy_layouts(
    records: Sequence[HierarchyRecord],
    note_ids: Sequence[str],
    semantic_positions: np.ndarray,
    config: GalaxyLayoutConfig | None = None,
) -> GalaxyLayoutResult:
    """Generate stable hierarchy and globe coordinates from persisted semantics."""

    settings = config or GalaxyLayoutConfig()
    ordered_records = tuple(sorted(records, key=lambda item: item.note_id))
    record_by_id = {record.note_id: record for record in ordered_records}
    if len(record_by_id) != len(ordered_records) or len(set(note_ids)) != len(note_ids):
        raise ValueError("records and semantic positions require unique note IDs")
    if set(record_by_id) != set(note_ids):
        raise ValueError("hierarchy records and semantic positions must use the same note IDs")

    semantic = np.array(semantic_positions, dtype=np.float64, copy=True)
    if semantic.shape != (len(note_ids), 3):
        raise ValueError(f"semantic positions must have shape {(len(note_ids), 3)}")
    if not np.isfinite(semantic).all():
        raise ValueError("semantic positions must be finite")
    semantic_scale = max(float(np.max(np.abs(semantic))), 1.0) if semantic.size else 1.0
    semantic /= semantic_scale
    semantic_by_id = {note_id: semantic[index] for index, note_id in enumerate(note_ids)}

    if not ordered_records:
        return GalaxyLayoutResult({}, {}, settings.artifact_metadata())

    include_unassigned = any(
        record.parent_id == UNASSIGNED_HUB_ID for record in ordered_records
    )
    roles = {record.note_id: record.role for record in ordered_records}
    depths = {record.note_id: record.depth for record in ordered_records}
    if include_unassigned:
        roles[UNASSIGNED_HUB_ID] = "hub"
        depths[UNASSIGNED_HUB_ID] = 0

    children: dict[str, list[str]] = {}
    roots: list[str] = []
    for record in ordered_records:
        if record.parent_id is None:
            if record.role != "hub":
                raise ValueError("only hubs may be hierarchy roots")
            roots.append(record.note_id)
        else:
            children.setdefault(record.parent_id, []).append(record.note_id)
    if include_unassigned:
        roots.append(UNASSIGNED_HUB_ID)
    known_ids = set(roles)
    if any(parent not in known_ids for parent in children):
        raise ValueError("hierarchy contains an unknown parent")
    _validate_hierarchy(ordered_records, roles, children, roots)

    subtree_sizes = _subtree_sizes(roles, children, depths)
    galaxy = _galaxy_positions(
        roots,
        roles,
        depths,
        children,
        subtree_sizes,
        semantic_by_id,
        settings,
    )
    compact = _compact_positions(roles, settings)
    if set(galaxy) != known_ids or set(compact) != known_ids:
        raise ValueError("layout generation produced an incomplete node set")
    if not all(
        math.isfinite(value)
        for layout in (galaxy, compact)
        for point in layout.values()
        for value in point
    ):
        raise ValueError("layout generation produced non-finite coordinates")
    return GalaxyLayoutResult(galaxy, compact, settings.artifact_metadata())


def _galaxy_positions(
    roots: list[str],
    roles: dict[str, str],
    depths: dict[str, int],
    children: dict[str, list[str]],
    subtree_sizes: dict[str, int],
    semantic: dict[str, np.ndarray],
    config: GalaxyLayoutConfig,
) -> dict[str, Point3]:
    root_ids = _stable_order(roots, config.seed)
    positions: dict[str, np.ndarray] = {}
    if len(root_ids) == 1:
        positions[root_ids[0]] = np.zeros(3, dtype=np.float64)
    else:
        largest = max((subtree_sizes.get(root_id, 1) for root_id in root_ids), default=1)
        root_radius = NODE_SPACING * (8.0 + 1.4 * math.sqrt(largest)) * math.sqrt(len(root_ids))
        for root_id, direction in zip(root_ids, _fibonacci_directions(len(root_ids))):
            positions[root_id] = direction * root_radius

    hubs = sorted(
        (node_id for node_id, role in roles.items() if role == "hub"),
        key=lambda node_id: (depths[node_id], node_id),
    )
    for parent_id in hubs:
        parent = positions.get(parent_id)
        if parent is None:
            continue
        child_ids = children.get(parent_id, [])
        child_hubs = [node_id for node_id in child_ids if roles[node_id] == "hub"]
        child_notes = [node_id for node_id in child_ids if roles[node_id] == "note"]
        depth = depths[parent_id]
        depth_scale = (
            DEPTH_DECAY_CONSTANT * (DEPTH_DECAY_CONSTANT + 1.0)
            / ((depth + DEPTH_DECAY_CONSTANT) * (depth + DEPTH_DECAY_CONSTANT + 1.0))
        )
        if child_hubs:
            subtree_factor = min(math.sqrt(sum(subtree_sizes[node_id] for node_id in child_hubs)), 8.0)
            radius = NODE_SPACING * (4.0 + subtree_factor) * depth_scale
            _place_orbit(child_hubs, parent, radius, positions, semantic, config)
        if child_notes:
            radius = NODE_SPACING * (2.2 + 0.55 * math.sqrt(len(child_notes))) * depth_scale
            _place_orbit(child_notes, parent, radius, positions, semantic, config)
    return {node_id: _point(position) for node_id, position in sorted(positions.items())}


def _place_orbit(
    node_ids: list[str],
    parent: np.ndarray,
    radius: float,
    positions: dict[str, np.ndarray],
    semantic: dict[str, np.ndarray],
    config: GalaxyLayoutConfig,
) -> None:
    ordered = _stable_order(node_ids, config.seed)
    directions = _fibonacci_directions(len(ordered))
    basis = _local_basis(parent)
    available_semantics = [semantic[node_id] for node_id in ordered if node_id in semantic]
    centroid = np.mean(available_semantics, axis=0) if available_semantics else np.zeros(3)
    for node_id, direction in zip(ordered, directions):
        local_direction = basis @ direction
        offset = np.zeros(3)
        if node_id in semantic:
            displacement = semantic[node_id] - centroid
            magnitude = float(np.linalg.norm(displacement))
            if magnitude > np.finfo(np.float64).eps:
                offset = (basis @ (displacement / magnitude)) * radius * SEMANTIC_OFFSET_RATIO
        positions[node_id] = parent + local_direction * radius + offset


def _compact_positions(
    roles: dict[str, str], config: GalaxyLayoutConfig
) -> dict[str, Point3]:
    hubs = _stable_order([node_id for node_id, role in roles.items() if role == "hub"], config.seed)
    notes = _stable_order([node_id for node_id, role in roles.items() if role == "note"], config.seed)
    hub_radius = NODE_SPACING * (1.8 + 0.12 * math.sqrt(len(hubs)))
    note_radius = NODE_SPACING * (4.2 + 0.18 * math.sqrt(len(notes)))
    positions: dict[str, Point3] = {}
    for node_id, direction in zip(hubs, _fibonacci_directions(len(hubs))):
        positions[node_id] = _point(direction * hub_radius)
    for node_id, direction in zip(notes, _fibonacci_directions(len(notes))):
        positions[node_id] = _point(direction * note_radius)
    return dict(sorted(positions.items()))


def _subtree_sizes(
    roles: dict[str, str],
    children: dict[str, list[str]],
    depths: dict[str, int],
) -> dict[str, int]:
    sizes = {node_id: 1 for node_id in roles}
    for node_id in sorted(roles, key=lambda item: (depths[item], item), reverse=True):
        for child_id in children.get(node_id, []):
            sizes[node_id] += sizes[child_id]
    return sizes


def _validate_hierarchy(
    records: Sequence[HierarchyRecord],
    roles: dict[str, str],
    children: dict[str, list[str]],
    roots: list[str],
) -> None:
    record_by_id = {record.note_id: record for record in records}
    for parent_id, child_ids in children.items():
        if roles[parent_id] != "hub":
            raise ValueError(f"hierarchy parent must be a hub: {parent_id}")
        if parent_id == UNASSIGNED_HUB_ID:
            for child_id in child_ids:
                child = record_by_id[child_id]
                if child.role != "note" or child.assignment != "unassigned":
                    raise ValueError("only unassigned notes may use the virtual parent")
    for record in records:
        if record.assignment == "unassigned" and record.parent_id != UNASSIGNED_HUB_ID:
            raise ValueError("unassigned notes must use the virtual parent")

    visited: set[str] = set()
    computed_depth: dict[str, int] = {}
    computed_root: dict[str, str] = {}
    queue = list(_stable_order(roots, 0))
    for root_id in queue:
        computed_depth[root_id] = 0
        computed_root[root_id] = root_id

    cursor = 0
    while cursor < len(queue):
        parent_id = queue[cursor]
        cursor += 1
        if parent_id in visited:
            raise ValueError("hierarchy contains a cycle")
        visited.add(parent_id)
        for child_id in sorted(children.get(parent_id, [])):
            if child_id in computed_depth:
                raise ValueError("hierarchy contains a cycle")
            computed_depth[child_id] = computed_depth[parent_id] + 1
            computed_root[child_id] = computed_root[parent_id]
            queue.append(child_id)

    if visited != set(roles):
        raise ValueError("hierarchy contains a cycle or unreachable node")
    for record in records:
        if record.depth != computed_depth[record.note_id]:
            raise ValueError(f"hierarchy depth mismatch: {record.note_id}")
        if record.topic_root_id != computed_root[record.note_id]:
            raise ValueError(f"hierarchy topic root mismatch: {record.note_id}")


def _stable_order(node_ids: Sequence[str], seed: int) -> list[str]:
    return sorted(
        node_ids,
        key=lambda node_id: (
            hashlib.sha256(f"{seed}:{node_id}".encode("utf-8")).digest(),
            node_id,
        ),
    )


def _fibonacci_directions(count: int) -> list[np.ndarray]:
    if count <= 0:
        return []
    if count == 1:
        return [np.asarray((1.0, 0.0, 0.0), dtype=np.float64)]
    directions: list[np.ndarray] = []
    for index in range(count):
        y = 1.0 - 2.0 * (index + 0.5) / count
        planar = math.sqrt(max(0.0, 1.0 - y * y))
        angle = index * GOLDEN_ANGLE
        directions.append(np.asarray((math.cos(angle) * planar, y, math.sin(angle) * planar)))
    return directions


def _local_basis(origin: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(origin))
    normal = origin / norm if norm > np.finfo(np.float64).eps else np.asarray((0.0, 0.0, 1.0))
    reference = np.asarray((0.0, 1.0, 0.0))
    if abs(float(np.dot(normal, reference))) > 0.9:
        reference = np.asarray((1.0, 0.0, 0.0))
    tangent = np.cross(reference, normal)
    tangent /= np.linalg.norm(tangent)
    bitangent = np.cross(normal, tangent)
    return np.column_stack((tangent, bitangent, normal))


def _point(position: np.ndarray) -> Point3:
    return float(position[0]), float(position[1]), float(position[2])
