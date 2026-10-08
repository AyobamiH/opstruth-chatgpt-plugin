import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canonicalDigest } from "../src/canonical.js";
import { TOOL_DEFINITIONS } from "../src/tools.js";

const baseline = JSON.parse(await readFile(new URL("../contracts/compatibility/0.3.1-tools.json", import.meta.url), "utf8"));
const domain = "opstruth.tool-definition.v1\0";

// The historical baseline stays immutable. Only this explicit false-to-true
// disclosure correction is normalised for the legacy contract comparison.
const externalReadCorrections = new Set([
  "opstruth_inspect_repository",
  "opstruth_audit_repository",
  "opstruth_trace_routes",
  "opstruth_audit_environment",
  "opstruth_audit_secrets",
  "opstruth_review_api_contracts",
  "opstruth_review_migrations",
  "opstruth_check_github_handoff",
  "opstruth_check_deployment",
  "opstruth_prepare_sandbox_verification",
]);

test("legacy contracts are preserved except the explicit external-read disclosure correction", async () => {
  const definitions = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
  assert.equal(Object.keys(baseline.tools).length, 16);
  for (const [name, expected] of Object.entries(baseline.tools)) {
    const tool = definitions.get(name);
    assert.ok(tool, `legacy tool removed: ${name}`);
    let annotations = tool.annotations;
    if (externalReadCorrections.has(name)) {
      assert.deepEqual(annotations, {
        readOnlyHint: true, destructiveHint: false, openWorldHint: true,
      }, `external-read disclosure must remain explicit: ${name}`);
      annotations = { ...annotations, openWorldHint: false };
    }
    const digest = await canonicalDigest(domain, {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations,
    });
    assert.equal(digest, expected, `legacy tool contract drift: ${name}`);
  }
});

