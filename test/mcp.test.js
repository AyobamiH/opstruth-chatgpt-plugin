import assert from "node:assert/strict";
import test from "node:test";
import worker, { handleRpc } from "../src/worker.js";
import { installGithubFetchMock } from "./fixtures.js";

test("MCP initialization advertises tools and resources", async () => {
  const request = new Request("https://example.test/mcp", { method: "POST" });
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, request, {}, {});
  assert.equal(initialized.result.serverInfo.name, "opstruth");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, request, {}, {});
  assert.equal(listed.result.tools.length, 13);
  assert.ok(listed.result.tools.every((tool) => tool.annotations.readOnlyHint === true));
  const resources = await handleRpc({ jsonrpc: "2.0", id: 3, method: "resources/list" }, request, {}, {});
  assert.equal(resources.result.resources[0].uri, "ui://opstruth/evidence-v1.html");
});

test("MCP repository call returns structured evidence and receipt", async () => {
  const restore = installGithubFetchMock();
  try {
    const request = new Request("https://example.test/mcp", { method: "POST" });
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "opstruth_audit_repository", arguments: { repository_url: "Example/project" } },
    }, request, {}, {});
    assert.equal(result.result.structuredContent.repository.fullName, "Example/project");
    assert.equal(result.result.structuredContent.receipt.signed, false);
    assert.equal(result.result.structuredContent.receipt.changedState, false);
  } finally {
    restore();
  }
});

test("worker serves health and policy routes", async () => {
  const health = await worker.fetch(new Request("https://example.test/health"), {}, {});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).tools, 13);
  for (const path of ["/privacy", "/terms", "/support"]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`), {}, {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
  }
});

test("non-GitHub repository request fails closed without mutation", async () => {
  const request = new Request("https://example.test/mcp", { method: "POST" });
  const result = await handleRpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "opstruth_inspect_repository", arguments: { repository_url: "https://evil.example/repo" } },
  }, request, {}, {});
  assert.equal(result.result.isError, true);
  assert.equal(result.result.structuredContent.changedState, false);
});
