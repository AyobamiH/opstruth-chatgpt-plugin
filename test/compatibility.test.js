import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canonicalDigest } from "../src/canonical.js";
import { TOOL_DEFINITIONS } from "../src/tools.js";

const baseline = JSON.parse(await readFile(new URL("../contracts/compatibility/0.3.1-tools.json", import.meta.url), "utf8"));
const domain = "opstruth.tool-definition.v1\0";

test("all 0.3.1 public tool contracts remain byte-semantics compatible", async () => {
  const definitions = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
  assert.equal(Object.keys(baseline.tools).length, 16);
  for (const [name, expected] of Object.entries(baseline.tools)) {
    const tool = definitions.get(name);
    assert.ok(tool, `legacy tool removed: ${name}`);
    const digest = await canonicalDigest(domain, {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    });
    assert.equal(digest, expected, `legacy tool contract drift: ${name}`);
  }
});

