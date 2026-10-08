import assert from "node:assert/strict";
import test from "node:test";
import { analyticsPoint, classifyClient, feedbackPoint, recordFeedbackEvent, recordToolEvent, summarizeToolResult, classifyToolError, shouldRecordAnalytics } from "../src/analytics.js";

test("analytics stores bounded aggregate dimensions only", () => {
  const request = new Request("https://example.test/mcp", { headers: { "user-agent": "ChatGPT/1.0" } });
  assert.equal(classifyClient(request), "chatgpt");
  const point = analyticsPoint({
    tool: "opstruth_audit_repository", outcome: "success", status: 200, latencyMs: 42, client: "chatgpt",
    verdict: "insufficient_evidence", counts: { evidence: 4, warnings: 2, failures: 0, notVerified: 3 }, ciObserved: true, signedEvidence: true,
  });
  assert.deepEqual(point.indexes, ["opstruth_audit_repository"]);
  assert.deepEqual(point.blobs, ["tool_call", "opstruth_audit_repository", "success", "chatgpt", "0.4.1", "insufficient_evidence", "ci_observed", "deployment_not_probed", "evidence_signed", "none"]);
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

test("caller supplied labels cannot enter aggregate dimensions", () => {
  const point = analyticsPoint({ tool: "customer_123", outcome: "private_case", client: "secret_id", errorCategory: "customer_error_text" });
  assert.deepEqual(point.indexes, ["unknown"]);
  assert.equal(point.blobs[1], "unknown");
  assert.equal(point.blobs[2], "unknown");
  assert.equal(point.blobs[3], "mcp");
  assert.equal(JSON.stringify(point).includes("customer"), false);
  for (const error of [new Error("tool_input_invalid:private/customer"), new Error("opstruth_signing_identity_required"), new Error("tool_not_found"), new Error("private upstream body"), "secret"]) {
    const category = classifyToolError(error);
    assert.ok(["input_invalid", "signing_unavailable", "tool_not_found", "other"].includes(category));
    assert.equal(JSON.stringify(analyticsPoint({ tool: "opstruth_audit_repository", outcome: "error", errorCategory: category })).includes("private"), false);
  }
  assert.equal(analyticsPoint({ outcome: "error", errorCategory: "private" }).blobs[9], "other");
});

test("privacy signals suppress tool and feedback writes without scheduling work", async () => {
  for (const headers of [{ dnt: "1" }, { "sec-gpc": "1" }, { dnt: "0", "sec-gpc": "1" }]) {
    const request = new Request("https://example.test/mcp", { headers });
    const writes = [];
    const pending = [];
    const env = { OPSTRUTH_ANALYTICS: { writeDataPoint: (point) => writes.push(point) } };
    const ctx = { waitUntil: (promise) => pending.push(promise) };
    assert.equal(shouldRecordAnalytics(request), false);
    recordToolEvent(env, ctx, request, { tool: "opstruth_audit_repository", outcome: "success" });
    assert.equal(recordFeedbackEvent(env, ctx, { reason: "useful", surface: "mcp" }, request), false);
    await Promise.all(pending);
    assert.deepEqual(writes, []);
    assert.deepEqual(pending, []);
  }
  assert.equal(shouldRecordAnalytics(new Request("https://example.test/mcp", { headers: { dnt: "0" } })), true);
});
