import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_DEFINITIONS } from "../src/tools.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const prohibitedDirectories = [
  "src/executor",
  "src/actions",
  "src/remediation",
  "src/deploy-target",
];

const sensitiveInput = /^(?:api[_-]?key|access[_-]?token|auth[_-]?token|credential|password|pat|private[_-]?key|secret|signing[_-]?key|ssh[_-]?key|token)$/i;
const mutationToolName = /(?:^|_)(?:apply|approve|commit|create|delete|deploy|merge|mutate|open|publish|push|release|remediate|restart|rollback|rotate|set|update|write)(?:_|$)/i;

for (const relative of prohibitedDirectories) {
  if (await stat(join(root, relative)).catch(() => null)) failures.push(`${relative}: execution-plane directory is prohibited`);
}

function schemaKeys(schema, path = "input") {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema)) {
    schema.forEach((value, index) => schemaKeys(value, `${path}[${index}]`));
    return;
  }
  for (const key of Object.keys(schema.properties || {})) {
    if (sensitiveInput.test(key)) failures.push(`${path}.${key}: credential-like public tool input is prohibited`);
    schemaKeys(schema.properties[key], `${path}.${key}`);
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key !== "properties") schemaKeys(value, `${path}.${key}`);
  }
}

for (const definition of TOOL_DEFINITIONS) {
  if (!definition.name.startsWith("opstruth_")) failures.push(`${definition.name}: public tool must use the opstruth namespace`);
  if (mutationToolName.test(definition.name)) failures.push(`${definition.name}: mutation-capable tool names belong in the execution plane`);
  if (definition.annotations?.readOnlyHint !== true) failures.push(`${definition.name}: readOnlyHint must be true`);
  if (definition.annotations?.destructiveHint !== false) failures.push(`${definition.name}: destructiveHint must be false`);
  schemaKeys(definition.inputSchema, definition.name);
}

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (/\.(?:js|mjs|ts)$/.test(entry.name)) result.push(path);
  }
  return result;
}

const sourceRules = [
  ["target mutation HTTP method", /method\s*:\s*["'](?:DELETE|PATCH|PUT)["']/],
  ["GraphQL mutation", /\bmutation\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/],
  ["child process execution", /node:child_process|child_process/],
];

for (const path of await sourceFiles(join(root, "src"))) {
  const source = await readFile(path, "utf8");
  for (const [label, pattern] of sourceRules) if (pattern.test(source)) failures.push(`${path}: ${label}`);
}

const agents = await readFile(join(root, "AGENTS.md"), "utf8");
const constitution = await readFile(join(root, "docs/architecture/BOUNDARIES.md"), "utf8");
if (!agents.includes("All OpsTruth tools that inspect external or user-controlled systems MUST remain non-mutating.")) {
  failures.push("AGENTS.md: external-system non-mutation invariant is missing");
}
if (!constitution.includes("OpsTruth MUST NOT mutate a system it is asked to independently verify.")) {
  failures.push("docs/architecture/BOUNDARIES.md: product invariant is missing");
}

const expectedContracts = new Map([
  ["action-request.schema.json", "urn:opstruth:schema:action-request:1.0.0"],
  ["action-authorization.schema.json", "urn:opstruth:schema:action-authorization:1.0.0"],
  ["execution-receipt.schema.json", "urn:opstruth:schema:execution-receipt:1.0.0"],
  ["verification-result.schema.json", "urn:opstruth:schema:verification-result:1.0.0"],
]);

for (const [name, id] of expectedContracts) {
  const path = join(root, "contracts", name);
  const schema = JSON.parse(await readFile(path, "utf8"));
  if (schema.$id !== id) failures.push(`${name}: stable schema id mismatch`);
  if (schema.additionalProperties !== false) failures.push(`${name}: top-level unknown fields must fail closed`);
  if (schema.properties?.schemaVersion?.const !== "1.0.0") failures.push(`${name}: schema version mismatch`);
  if (!schema.required?.includes("digest")) failures.push(`${name}: canonical digest is required`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`architecture boundary check passed: ${TOOL_DEFINITIONS.length} read-only tools, ${expectedContracts.size} execution-plane contracts`);
