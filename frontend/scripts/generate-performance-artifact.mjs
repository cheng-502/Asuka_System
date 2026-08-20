import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const noteCount = Number(process.argv[2] ?? 1_000);
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(frontendRoot, process.argv[3] ?? "public/data/knowledge-space.perf.json");
if (!Number.isInteger(noteCount) || noteCount < 4 || noteCount > 10_000) {
  throw new RangeError("note count must be an integer between 4 and 10,000");
}

const fixturePath = resolve(frontendRoot, "../contracts/fixtures/knowledge-space-v2.fixture.json");
const artifact = JSON.parse(await readFile(fixturePath, "utf8"));
const template = artifact.nodes.find((node) => node.id === "misc/dentist.md");
if (!template) throw new Error("performance fixture template node is missing");

for (let index = artifact.nodes.length; index < noteCount; index += 1) {
  const direction = fibonacciDirection(index, noteCount);
  artifact.nodes.push({
    ...structuredClone(template),
    id: `perf/note-${String(index).padStart(4, "0")}.md`,
    title: `Performance Note ${index}`,
    summary: "Synthetic public performance fixture node.",
    layouts: {
      semantic: point(direction, 4.5),
      galaxy: point(direction, 4),
      compact: point(direction, 2.2),
    },
  });
}
artifact.source.note_count = noteCount;
artifact.source.vault_hash = "a".repeat(64);
artifact.generated_at = "2026-08-21T00:00:00Z";
artifact.pipeline.version = "mvp1.5.0";

await writeFile(outputPath, `${JSON.stringify(artifact)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, note_count: noteCount }));

function fibonacciDirection(index, count) {
  const y = 1 - (2 * (index + 0.5)) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
}

function point(direction, radius) {
  return {
    x: direction.x * radius,
    y: direction.y * radius,
    z: direction.z * radius,
  };
}
