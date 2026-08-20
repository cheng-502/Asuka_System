import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../contracts/knowledge-space.schema.json";
import type {
  KnowledgeHierarchy,
  KnowledgeSpaceArtifactV1Wire,
  KnowledgeSpaceArtifactV2Wire,
  KnowledgeSpaceArtifactWire,
  KnowledgeSpaceLink,
  KnowledgeSpacePosition,
} from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<KnowledgeSpaceArtifactWire>(schema);

export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactValidationError";
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"}: ${error.message ?? "invalid"}`)
    .join("; ");
}

export function validateArtifact(input: unknown): KnowledgeSpaceArtifactWire {
  if (!validateSchema(input)) {
    throw new ArtifactValidationError(formatSchemaErrors(validateSchema.errors));
  }

  const artifact = input as KnowledgeSpaceArtifactWire;
  if (artifact.version === 1) validateV1Records(artifact);
  else validateV2Records(artifact);
  return artifact;
}

function validateV1Records(artifact: KnowledgeSpaceArtifactV1Wire): void {
  const nodeIds = artifact.nodes.map((node) => node.id);
  requireUnique(nodeIds, "nodes: duplicate node id");
  if (artifact.source.note_count !== nodeIds.length) {
    throw new ArtifactValidationError("source.note_count: does not match nodes");
  }
  artifact.nodes.forEach((node, index) => {
    validatePosition(node.position, `nodes[${index}].position`);
  });
  validateLinks(artifact.links, new Set(nodeIds), null);
}

function validateV2Records(artifact: KnowledgeSpaceArtifactV2Wire): void {
  const realIds = artifact.nodes.map((node) => node.id);
  const virtualIds = artifact.virtual_nodes.map((node) => node.id);
  requireUnique([...realIds, ...virtualIds], "nodes: duplicate real or virtual node id");
  if (artifact.source.note_count !== realIds.length) {
    throw new ArtifactValidationError("source.note_count: does not match real nodes");
  }

  const records = new Map<string, { hierarchy: KnowledgeHierarchy }>();
  [...artifact.nodes, ...artifact.virtual_nodes].forEach((node) => records.set(node.id, node));
  for (const [collectionName, collection] of [
    ["nodes", artifact.nodes],
    ["virtual_nodes", artifact.virtual_nodes],
  ] as const) {
    collection.forEach((node, index) => {
      for (const [layoutName, position] of Object.entries(node.layouts)) {
        validatePosition(position, `${collectionName}[${index}].layouts.${layoutName}`);
      }
    });
  }

  artifact.virtual_nodes.forEach((node, index) => {
    const hierarchy = node.hierarchy;
    if (
      hierarchy.role !== "hub"
      || hierarchy.parent_id !== null
      || hierarchy.depth !== 0
      || hierarchy.assignment !== "unassigned"
      || hierarchy.topic_root_id !== node.id
    ) {
      throw new ArtifactValidationError(`virtual_nodes[${index}].hierarchy: invalid virtual hub root`);
    }
  });

  const unassignedPresent = records.has("virtual:unassigned");
  artifact.nodes.forEach((node, index) => {
    const hierarchy = node.hierarchy;
    const parentId = hierarchy.parent_id;
    if (hierarchy.role === "hub" && hierarchy.assignment !== "explicit") {
      throw new ArtifactValidationError(`nodes[${index}].hierarchy.assignment: hubs must be explicit`);
    }
    if (parentId === null) {
      if (
        hierarchy.role !== "hub"
        || hierarchy.depth !== 0
        || hierarchy.assignment !== "explicit"
        || hierarchy.topic_root_id !== node.id
      ) {
        throw new ArtifactValidationError(`nodes[${index}].hierarchy: invalid top-level hub`);
      }
    } else {
      const parent = records.get(parentId);
      if (!parent) {
        throw new ArtifactValidationError(`nodes[${index}].hierarchy.parent_id: unknown node`);
      }
      if (parent.hierarchy.role !== "hub") {
        throw new ArtifactValidationError(`nodes[${index}].hierarchy.parent_id: parent is not a hub`);
      }
      if (hierarchy.depth !== parent.hierarchy.depth + 1) {
        throw new ArtifactValidationError(`nodes[${index}].hierarchy.depth: inconsistent with parent`);
      }
    }

    if (parentId?.startsWith("virtual:")) {
      if (
        hierarchy.role !== "note"
        || hierarchy.assignment !== "unassigned"
        || parentId !== "virtual:unassigned"
      ) {
        throw new ArtifactValidationError(`nodes[${index}].hierarchy: invalid unassigned parent`);
      }
    } else if (hierarchy.assignment === "unassigned") {
      throw new ArtifactValidationError(`nodes[${index}].hierarchy: unassigned node requires virtual parent`);
    }
    if (hierarchy.assignment === "unassigned" && !unassignedPresent) {
      throw new ArtifactValidationError(`nodes[${index}].hierarchy: missing virtual unassigned hub`);
    }
  });

  artifact.nodes.forEach((node) => {
    const rootId = resolveTopicRoot(node.id, records);
    if (node.hierarchy.topic_root_id !== rootId) {
      throw new ArtifactValidationError(`nodes[${node.id}].hierarchy.topic_root_id: inconsistent root`);
    }
  });
  if (
    (artifact.relationships.min_similarity !== null
      && !Number.isFinite(artifact.relationships.min_similarity))
    || !Number.isFinite(artifact.relationships.hierarchy_min_similarity)
  ) {
    throw new ArtifactValidationError("relationships: thresholds must be finite");
  }
  validateLinks(artifact.links, new Set(realIds), artifact.relationships.min_similarity);
}

function resolveTopicRoot(
  nodeId: string,
  records: ReadonlyMap<string, { hierarchy: KnowledgeHierarchy }>,
): string {
  const visited = new Set<string>();
  let currentId = nodeId;
  while (true) {
    if (visited.has(currentId)) {
      throw new ArtifactValidationError(`nodes[${nodeId}].hierarchy: parent cycle`);
    }
    visited.add(currentId);
    const current = records.get(currentId);
    if (!current) {
      throw new ArtifactValidationError(`nodes[${nodeId}].hierarchy.parent_id: unknown node`);
    }
    const parentId = current.hierarchy.parent_id;
    if (parentId === null) return currentId;
    currentId = parentId;
  }
}

function validateLinks(
  links: readonly KnowledgeSpaceLink[],
  knownRealNodes: ReadonlySet<string>,
  minSimilarity: number | null,
): void {
  const errors: string[] = [];
  links.forEach((link, index) => {
    if (link.similarity !== undefined && !Number.isFinite(link.similarity)) {
      errors.push(`links[${index}].similarity: must be finite`);
    }
    if (
      minSimilarity !== null
      && link.types.includes("semantic")
      && link.similarity !== undefined
      && link.similarity < minSimilarity
    ) {
      errors.push(`links[${index}].similarity: below recorded threshold`);
    }
    if (link.source.startsWith("virtual:")) errors.push(`links[${index}].source: virtual namespace is reserved`);
    if (link.target.startsWith("virtual:")) errors.push(`links[${index}].target: virtual namespace is reserved`);
    if (link.unresolved_target?.startsWith("virtual:")) {
      errors.push(`links[${index}].unresolved_target: virtual namespace is reserved`);
    }
    if (!knownRealNodes.has(link.source)) errors.push(`links[${index}].source: unknown real node`);
    if (!link.is_unresolved && !knownRealNodes.has(link.target)) {
      errors.push(`links[${index}].target: unknown resolved real node`);
    }
  });
  if (errors.length) throw new ArtifactValidationError(errors.join("; "));
}

function validatePosition(position: KnowledgeSpacePosition, path: string): void {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new ArtifactValidationError(`${path}: coordinates must be finite`);
  }
}

function requireUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new ArtifactValidationError(message);
}
