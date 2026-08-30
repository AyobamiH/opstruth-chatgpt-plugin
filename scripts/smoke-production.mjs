const endpoint = String(process.env.OPSTRUTH_PRODUCTION_URL || "https://mcp.opstruth.io").replace(/\/$/, "");
const expectedVersion = process.env.OPSTRUTH_EXPECTED_VERSION || "0.4.0";
const expectedCommit = process.env.OPSTRUTH_EXPECTED_COMMIT || null;
const expectedTools = 21;
const errors = [];

async function request(path, init = {}) {
  try {
    return await fetch(`${endpoint}${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function mcpCall(id, method, params = {}) {
  const response = await request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response) return {};
  if (!response.ok) errors.push(`/mcp ${method}: HTTP ${response.status}`);
  return response.json().catch(() => ({}));
}

for (const path of ["/health", "/signing-key", "/privacy", "/terms", "/support"]) {
  const response = await request(path);
  if (!response) continue;
  if (!response.ok) errors.push(`${path}: HTTP ${response.status}`);
  if (path === "/health") {
    const body = await response.json().catch(() => ({}));
    if (body.version !== expectedVersion) errors.push(`/health: expected version ${expectedVersion}, got ${body.version || "missing"}`);
    if (expectedCommit && body.commit !== expectedCommit) errors.push(`/health: expected commit ${expectedCommit}, got ${body.commit || "missing"}`);
    if (body.tools !== expectedTools) errors.push(`/health: expected ${expectedTools} tools, got ${body.tools}`);
    if (body.evidenceGraph !== "1.0.0") errors.push(`/health: expected Evidence Graph 1.0.0, got ${body.evidenceGraph || "missing"}`);
    if (body.evidenceSigning !== "configured") errors.push(`/health: evidence signing is ${body.evidenceSigning || "missing"}`);
  }
  if (path === "/signing-key") {
    const body = await response.json().catch(() => ({}));
    if (!body.configured || body.algorithm !== "Ed25519" || !/^sha256:[a-f0-9]{64}$/.test(body.signerFingerprint || "")) {
      errors.push("/signing-key: stable Ed25519 evidence signing is not configured");
    }
  }
}

const initialise = await mcpCall(1, "initialize", { protocolVersion: "2025-06-18" });
if (initialise.result?.serverInfo?.version !== expectedVersion) errors.push("/mcp initialize: version mismatch");

const listed = await mcpCall(2, "tools/list");
const tools = listed.result?.tools || [];
if (tools.length !== expectedTools) errors.push(`/mcp tools/list: expected ${expectedTools} tools, got ${tools.length}`);
if (new Set(tools.map((tool) => tool.name)).size !== expectedTools) errors.push("/mcp tools/list: tool names are not unique");
if (tools.some((tool) => tool.annotations?.readOnlyHint !== true)) errors.push("/mcp tools/list: every tool must be explicitly read-only");
if (!tools.some((tool) => tool.name === "opstruth_snapshot_evidence")) errors.push("/mcp tools/list: Evidence Graph snapshot tool missing");

const snapshot = await mcpCall(3, "tools/call", {
  name: "opstruth_snapshot_evidence",
  arguments: { repository_url: "AyobamiH/opstruth-chatgpt-plugin" },
});
const graph = snapshot.result?.structuredContent;
if (snapshot.result?.isError || graph?.schema !== "opstruth.evidence-graph" || graph?.schemaVersion !== "1.0.0") {
  errors.push("/mcp tools/call: signed Evidence Graph snapshot failed");
} else if (!graph.proof || !/^sha256:[a-f0-9]{64}$/.test(graph.proof.signerFingerprint || "")) {
  errors.push("/mcp tools/call: Evidence Graph proof missing or malformed");
}

const rejectedFeedback = await request("/feedback", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ reason: "release_smoke", surface: "mcp" }),
});
if (rejectedFeedback?.status !== 400) errors.push(`/feedback: invalid reason should be rejected with HTTP 400, got ${rejectedFeedback?.status || "no response"}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`production smoke passed: ${endpoint} (${expectedVersion}${expectedCommit ? ` @ ${expectedCommit}` : ""}, ${expectedTools} read-only tools, signed Evidence Graph)`);
