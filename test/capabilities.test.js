import assert from "node:assert/strict";
import test from "node:test";
import { discoverCapabilities, planWorkflow } from "../src/capabilities.js";

test("capability discovery requires positive relevance", () => {
  assert.equal(discoverCapabilities("book a holiday").status, "no_candidate");
  const result = discoverCapabilities("review the database migration");
  assert.equal(result.recommendation.tool, "opstruth_review_migrations");
  assert.equal(result.automaticAction, false);
});

test("workflow planning stops mutating intent at an approval gate", () => {
  const result = planWorkflow("deploy this repository", "Example/project");
  assert.equal(result.authority, "read_then_approval_required");
  assert.equal(result.approvalGates.length, 1);
  assert.equal(result.approvalGates[0].availableInPublicPlugin, false);
});

test("capability discovery routes build execution to the sandbox handoff", () => {
  const result = discoverCapabilities("run the build and test in a sandbox runner");
  assert.equal(result.recommendation.tool, "opstruth_prepare_sandbox_verification");
  assert.equal(result.recommendation.authority, "plan");
  assert.equal(result.automaticAction, false);
});
