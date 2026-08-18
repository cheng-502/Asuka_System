import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../contracts/knowledge-space.schema.json";
import type { KnowledgeSpaceArtifact } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<KnowledgeSpaceArtifact>(schema);

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

function validateRelationTargets(artifact: KnowledgeSpaceArtifact): void {
  const nodeIds = new Set(artifact.nodes.map((node) => node.id));

  for (const [index, link] of artifact.links.entries()) {
    if (!nodeIds.has(link.source)) {
      throw new ArtifactValidationError(`links[${index}].source: unknown node`);
    }

    if (!link.is_unresolved && !nodeIds.has(link.target)) {
      throw new ArtifactValidationError(
        `links[${index}].target: unknown resolved node`,
      );
    }
  }
}

export function validateArtifact(input: unknown): KnowledgeSpaceArtifact {
  if (!validateSchema(input)) {
    throw new ArtifactValidationError(formatSchemaErrors(validateSchema.errors));
  }

  const artifact = input as KnowledgeSpaceArtifact;
  const nodeIds = artifact.nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new ArtifactValidationError("nodes: duplicate node id");
  }

  validateRelationTargets(artifact);
  return artifact;
}
