const endpoint = String(process.env.OPSTRUTH_PRODUCTION_URL || "https://opstruth-chatgpt.woeinvests.workers.dev").replace(/\/$/, "");
const expectedVersion = process.env.OPSTRUTH_EXPECTED_VERSION || "0.3.1";
const expectedCommit = process.env.OPSTRUTH_EXPECTED_COMMIT || null;
const paths = ["/health", "/privacy", "/terms", "/support"];
const errors = [];
for (const path of paths) {
  const response = await fetch(`${endpoint}${path}`);
  if (!response.ok) errors.push(`${path}: HTTP ${response.status}`);
  if (path === "/health") {
    const body = await response.json().catch(() => ({}));
    if (body.version !== expectedVersion) errors.push(`/health: expected version ${expectedVersion}, got ${body.version || "missing"}`);
    if (expectedCommit && body.commit !== expectedCommit) errors.push(`/health: expected commit ${expectedCommit}, got ${body.commit || "missing"}`);
    if (body.tools !== 16) errors.push(`/health: expected 16 tools, got ${body.tools}`);
  }
}
const mcp = await fetch(`${endpoint}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) });
if (!mcp.ok) errors.push(`/mcp initialize: HTTP ${mcp.status}`);
const mcpBody = await mcp.json().catch(() => ({}));
if (mcpBody.result?.serverInfo?.version !== expectedVersion) errors.push(`/mcp initialize: version mismatch`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`production smoke passed: ${endpoint} (${expectedVersion}${expectedCommit ? ` @ ${expectedCommit}` : ""})`);
