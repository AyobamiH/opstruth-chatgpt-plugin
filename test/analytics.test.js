import assert from "node:assert/strict";
import test from "node:test";
import { analyticsPoint, classifyClient, feedbackPoint, recordFeedbackEvent, recordToolEvent, summarizeToolResult } from "../src/analytics.js";

test("analytics stores bounded aggregate dimensions only", () => {
  const request = new Request("https://example.test/mcp", { headers: { "user-agent": "ChatGPT/1.0" } });
  assert.equal(classifyClient(request), "chatgpt");
  const point = analyticsPoint({
    tool: "opstruth_audit_repository", outcome: "success", status: 200, latencyMs: 42, client: "chatgpt",
    verdict: "insufficient_evidence", counts: { evidence: 4, warnings: 2, failures: 0, notVerified: 3 }, ciObserved: true, signedEvidence: true,
  });
  assert.deepEqual(point.indexes, ["opstruth_audit_repository"]);
  assert.deepEqual(point.blobs, ["tool_call", "opstruth_audit_repository", "success", "chatgpt", "0.4.1", "insufficient_evidence", "ci_observed", "deployment_not_probed", "evidence_signed"]);
  assert.deepEqual(point.doubles, [42, 200, 4, 2, 0, 3]);
});

test("analytics v2 derives only bounded non-identifying result dimensions", () => {
  const summary = summarizeToolResult({ structuredContent: {
    subject: { repositoryName: "private/customer" },
    summary: { verdict: "CONTRADICTED", counts: { unproven: 2 } },
    nodes: [{ type: "ci_run" }, { type: "runtime_observation" }],
    proof: { signerFingerprint: `sha256:${"a".repeat(64)}` },
  } });
  assert.deepEqual(summary, {
    verdict: "CONTRADICTED",
    counts: { evidence: 2, warnings: 0, failures: 0, notVerified: 2 },
    ciObserved: true,
    deploymentProbed: true,
    signedEvidence: true,
  });
  assert.equal(JSON.stringify(summary).includes("private/customer"), false);
});

test("feedback is reason-coded with no free text or subject identifier", async () => {
  assert.deepEqual(feedbackPoint({ reason: "useful", surface: "mcp" }), {
    indexes: ["feedback"], blobs: ["feedback", "useful", "mcp", "0.4.1"], doubles: [1],
  });
  assert.throws(() => feedbackPoint({ reason: "my repository is broken", surface: "mcp" }), /reason_invalid/);
  const writes = [];
  const pending = [];
  const recorded = recordFeedbackEvent(
    { OPSTRUTH_ANALYTICS: { writeDataPoint: (point) => writes.push(point) } },
    { waitUntil: (promise) => pending.push(promise) },
    { reason: "incorrect_binding", surface: "chatgpt" },
  );
  await Promise.all(pending);
  assert.equal(recorded, true);
  assert.equal(writes.length, 1);
});

test("analytics writes are best effort and use waitUntil", async () => {
  const writes = [];
  const pending = [];
  const env = { OPSTRUTH_ANALYTICS: { writeDataPoint(point) { writes.push(point); } } };
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  recordToolEvent(env, ctx, new Request("https://example.test/mcp"), { tool: "opstruth_probe_deployment", outcome: "success", status: 200, latencyMs: 4 });
  await Promise.all(pending);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].blobs[1], "opstruth_probe_deployment");
});
