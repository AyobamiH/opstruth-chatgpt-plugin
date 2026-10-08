import test from "node:test";
import assert from "node:assert/strict";
import { fetchHandler } from "../src/worker.js";

test("MCP errors remain HTTP 200 but record only a fixed cause category", async () => {
  const writes = [];
  const pending = [];
  const env = { OPSTRUTH_ANALYTICS: { writeDataPoint: (point) => writes.push(point) } };
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  const request = new Request("https://example.test/mcp", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "customer_123", arguments: {} } }) });
  const response = await fetchHandler(request, env, ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.isError, true);
  await Promise.all(pending);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].blobs[1], "unknown");
  assert.equal(writes[0].blobs[2], "error");
  assert.equal(writes[0].blobs[9], "tool_not_found");
  assert.equal(JSON.stringify(writes).includes("customer_123"), false);
});

test("privacy choice preserves MCP response and acknowledges unrecorded feedback", async () => {
  for (const signal of ["dnt", "sec-gpc"]) {
    const writes = [];
    const pending = [];
    const env = { OPSTRUTH_ANALYTICS: { writeDataPoint: (point) => writes.push(point) } };
    const ctx = { waitUntil: (promise) => pending.push(promise) };
    const response = await fetchHandler(new Request("https://example.test/mcp", { method: "POST",
      headers: { "content-type": "application/json", [signal]: "1" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "opstruth_get_verifier_identity", arguments: {} } }) }), env, ctx);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result.isError, true);
    const feedback = await fetchHandler(new Request("https://example.test/feedback", { method: "POST",
      headers: { "content-type": "application/json", [signal]: "1" },
      body: JSON.stringify({ reason: "useful", surface: "mcp" }) }), env, ctx);
    assert.equal(feedback.status, 202);
    assert.deepEqual(await feedback.json(), { status: "not_recorded", retainedFields: [] });
    const invalid = await fetchHandler(new Request("https://example.test/feedback", { method: "POST", headers: { "content-type": "application/json", [signal]: "1" }, body: JSON.stringify({ reason: "private_input", surface: "mcp" }) }), env, ctx);
    assert.equal(invalid.status, 400);
    await Promise.all(pending);
    assert.deepEqual(writes, []);
  }
});
