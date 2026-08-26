import assert from "node:assert/strict";
import test from "node:test";
import { analyticsPoint, classifyClient, recordToolEvent } from "../src/analytics.js";

test("analytics stores bounded aggregate dimensions only", () => {
  const request = new Request("https://example.test/mcp", { headers: { "user-agent": "ChatGPT/1.0" } });
  assert.equal(classifyClient(request), "chatgpt");
  const point = analyticsPoint({ tool: "opstruth_audit_repository", outcome: "success", status: 200, latencyMs: 42, client: "chatgpt" });
  assert.deepEqual(point.indexes, ["opstruth_audit_repository"]);
  assert.deepEqual(point.blobs, ["tool_call", "opstruth_audit_repository", "success", "chatgpt", "0.3.1"]);
  assert.deepEqual(point.doubles, [42, 200]);
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
