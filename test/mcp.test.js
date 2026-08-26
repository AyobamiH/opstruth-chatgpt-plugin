import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import worker, { handleRpc } from "../src/worker.js";
import { installGithubFetchMock } from "./fixtures.js";

test("MCP initialization advertises tools and resources", async () => {
  const request = new Request("https://example.test/mcp", { method: "POST" });
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, request, {}, {});
  assert.equal(initialized.result.serverInfo.name, "opstruth");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, request, {}, {});
  assert.equal(listed.result.tools.length, 16);
  assert.ok(listed.result.tools.every((tool) => tool.annotations.readOnlyHint === true));
  const resources = await handleRpc({ jsonrpc: "2.0", id: 3, method: "resources/list" }, request, {}, {});
  assert.equal(resources.result.resources[0].uri, "ui://opstruth/evidence-v1.html");
});

test("MCP repository call returns structured evidence and a signed receipt when configured", async () => {
  const restore = installGithubFetchMock();
  try {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const env = {
      OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
    const request = new Request("https://example.test/mcp", { method: "POST" });
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "opstruth_audit_repository", arguments: { repository_url: "Example/project" } },
    }, request, env, {});
    assert.equal(result.result.structuredContent.repository.fullName, "Example/project");
    assert.equal(result.result.structuredContent.receipt.signed, true);
    assert.equal(result.result.structuredContent.receipt.algorithm, "Ed25519");
    assert.equal(result.result.structuredContent.receipt.changedState, false);
  } finally {
    restore();
  }
});

test("worker serves health and policy routes", async () => {
  const health = await worker.fetch(new Request("https://example.test/health"), {}, {});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).tools, 16);
  for (const path of ["/privacy", "/terms", "/support"]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`), {}, {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
  }
});

test("deployment probing validates public HTTPS targets and retains no body", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "service.example" && url.pathname === "/health") {
      return new Response("secret response body", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const request = new Request("https://example.test/mcp", { method: "POST" });
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "opstruth_probe_deployment", arguments: { deployment_url: "https://service.example", health_paths: ["/health"] } },
    }, request, {}, {});
    const report = result.result.structuredContent;
    assert.equal(report.status, "healthy");
    assert.equal(report.probes[0].status, 200);
    assert.equal(JSON.stringify(report).includes("secret response body"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("deployment probing falls back to GET after an unsuccessful HEAD", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const method = typeof request === "string" ? "GET" : request.method;
    return method === "HEAD"
      ? new Response(null, { status: 404, headers: { "content-type": "text/plain" } })
      : new Response("healthy but deliberately discarded", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://example.test/mcp", { method: "POST" });
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 71,
      method: "tools/call",
      params: { name: "opstruth_probe_deployment", arguments: { deployment_url: "https://service.example", health_paths: ["/health"] } },
    }, request, {}, {});
    const report = result.result.structuredContent;
    assert.equal(report.status, "healthy");
    assert.equal(report.probes[0].method, "GET");
    assert.equal(report.probes[0].status, 200);
    assert.equal(JSON.stringify(report).includes("healthy but deliberately discarded"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("deployment probing rejects localhost and IP targets", async () => {
  const request = new Request("https://example.test/mcp", { method: "POST" });
  for (const deployment_url of ["https://localhost/health", "https://127.0.0.1/health"]) {
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "opstruth_probe_deployment", arguments: { deployment_url } },
    }, request, {}, {});
    assert.equal(result.result.isError, true);
    assert.equal(result.result.structuredContent.changedState, false);
  }
});

test("sandbox verification tool returns an approval-gated handoff without execution", async () => {
  const restore = installGithubFetchMock();
  try {
    const request = new Request("https://example.test/mcp", { method: "POST" });
    const result = await handleRpc({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "opstruth_prepare_sandbox_verification", arguments: { repository_url: "Example/project" } },
    }, request, {}, {});
    const report = result.result.structuredContent;
    assert.equal(report.status, "ready_for_approval");
    assert.equal(report.plan.approval.required, true);
    assert.equal(report.plan.approval.granted, false);
    assert.equal(report.plan.runner.availableInPublicPlugin, false);
    assert.ok(report.plan.commands.some((command) => command.display === "npm run test"));
    assert.equal(report.changedState.changed, false);
  } finally {
    restore();
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
