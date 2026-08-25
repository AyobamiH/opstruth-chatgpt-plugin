import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { TOOL_DEFINITIONS } from "../src/tools.js";

const root = new URL("..", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../.codex-plugin/plugin.json", import.meta.url), "utf8"));
const provenance = JSON.parse(await readFile(new URL("../provenance/sources.json", import.meta.url), "utf8"));
const errors = [];

if (manifest.name !== "opstruth") errors.push("plugin name must remain opstruth");
if (manifest.version !== "0.3.0") errors.push("plugin version mismatch");
if (manifest.author?.name !== "AYOBAMI JOHN HAASTRUP") errors.push("verified publisher name mismatch");
if (manifest.skills !== "./skills/") errors.push("skills path must be relative");
if (manifest.interface?.logo !== "./assets/logo-mark.png") errors.push("interface logo must reference the square product mark");
if (manifest.interface?.composerIcon !== "./assets/logo-mark.png") errors.push("composer icon must reference the square product mark");
if (!Array.isArray(provenance.sources) || provenance.sources.length < 6) errors.push("provenance must cover all source systems");

const logo = await stat(new URL(`../${manifest.interface?.logo || "missing"}`, import.meta.url)).catch(() => null);
if (!logo?.isFile() || logo.size === 0) errors.push("square product mark is missing or empty");

const skillRoot = new URL("../skills", import.meta.url);
const skillNames = await readdir(skillRoot);
if (skillNames.length !== 6) errors.push(`expected 6 skills, found ${skillNames.length}`);
for (const name of skillNames) {
  const directory = join(skillRoot.pathname, name);
  if (!(await stat(directory)).isDirectory()) continue;
  const skill = await readFile(join(directory, "SKILL.md"), "utf8");
  const agent = await readFile(join(directory, "agents/openai.yaml"), "utf8");
  if (!skill.startsWith("---\nname:")) errors.push(`${name}: invalid SKILL.md frontmatter`);
  if (!skill.includes(`name: ${name}\n`)) errors.push(`${name}: folder and frontmatter name differ`);
  if (!/description: .{30,}/.test(skill)) errors.push(`${name}: description is missing or too short`);
  if (!agent.includes("https://opstruth-chatgpt.woeinvests.workers.dev/mcp")) errors.push(`${name}: MCP dependency missing`);
}

const toolNames = TOOL_DEFINITIONS.map((tool) => tool.name);
if (new Set(toolNames).size !== toolNames.length) errors.push("tool names must be unique");
if (TOOL_DEFINITIONS.length !== 16) errors.push(`expected 16 tools, found ${TOOL_DEFINITIONS.length}`);
for (const tool of TOOL_DEFINITIONS) {
  if (tool.annotations?.readOnlyHint !== true) errors.push(`${tool.name}: must be read-only`);
  if (tool.annotations?.destructiveHint !== false) errors.push(`${tool.name}: destructive annotation mismatch`);
  if (tool.name === "opstruth_probe_deployment" && tool.annotations?.openWorldHint !== true) errors.push("deployment probe must declare open-world access");
  if (tool.name !== "opstruth_probe_deployment" && tool.annotations?.openWorldHint !== false) errors.push(`${tool.name}: open-world annotation mismatch`);
  if (!tool.inputSchema || !tool.outputSchema) errors.push(`${tool.name}: schemas required`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`plugin validation passed: ${skillNames.length} skills, ${TOOL_DEFINITIONS.length} tools, ${provenance.sources.length} provenance sources`);
