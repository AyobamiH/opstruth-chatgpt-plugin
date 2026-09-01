import assert from "node:assert/strict";
import test from "node:test";
import { compareInternalAndExternalProbes, mcpRequest } from "../scripts/lib/production-smoke.mjs";

const endpoint = "https://mcp.opstruth.io";
const paths = ["/health", "/privacy", "/terms", "/support"];

function report(statuses = {}) {
  return {
    status: "healthy",
    probes: paths.map((path) => ({
      requestedUrl: `${endpoint}${path}`,
      finalUrl: `${endpoint}${path}`,
      method: "HEAD",
      status: statuses[path] || 200,
      ok: (statuses[path] || 200) >= 200 && (statuses[path] || 200) < 300,
    })),
  };
}

test("every production MCP request is protocol-aware POST", () => {
  const call = mcpRequest(1, "initialize", { protocolVersion: "2025-06-18" });
  assert.equal(call.path, "/mcp");
  assert.equal(call.init.method, "POST");
  assert.equal(JSON.parse(call.init.body).method, "initialize");
});

test("internal and independent public probes must agree", () => {
  const externalStatuses = Object.fromEntries(paths.map((path) => [path, 200]));
  assert.deepEqual(compareInternalAndExternalProbes({ endpoint, paths, externalStatuses, internalReport: report() }), []);

  const looped = report({ "/health": 522 });
  looped.status = "partial";
  const loopErrors = compareInternalAndExternalProbes({ endpoint, paths, externalStatuses, internalReport: looped });
  assert.ok(loopErrors.some((error) => error.includes("Cloudflare 522")));
  assert.ok(loopErrors.some((error) => error.includes("contradiction")));

  const missing = report();
  missing.probes = missing.probes.filter((probe) => !probe.requestedUrl.endsWith("/support"));
  assert.ok(compareInternalAndExternalProbes({ endpoint, paths, externalStatuses, internalReport: missing }).some((error) => error.includes("/support was omitted")));
});
