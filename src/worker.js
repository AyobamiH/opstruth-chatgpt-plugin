import { callTool, TOOL_DEFINITIONS } from "./tools.js";
import { evidenceResource, EVIDENCE_UI_URI } from "./ui.js";
import { asErrorMessage, htmlResponse, jsonResponse, signingMetadata } from "./utils.js";
import { landingPage, privacyPage, supportPage, termsPage } from "./pages.js";
import { recordFeedbackEvent, recordToolEvent, summarizeToolResult } from "./analytics.js";
import { PLUGIN_VERSION } from "./version.js";
import { githubAppHealth } from "./github-app.js";

const SERVER = { name: "opstruth", version: PLUGIN_VERSION };
const INSTRUCTIONS = "Use OpsTruth for evidence-first public GitHub and user-supplied HTTPS health checks. Inspect before broad audits and prefer the narrowest matching tool. Use signed Evidence Graph snapshots when repository, commit, CI and optional runtime observations must be bound to one subject; compare only compatible caller-held snapshots. Verify execution outcomes only from a complete request, authorisation and receipt chain with separate authoritative authorizer and executor fingerprint allowlists, and never infer success from the receipt state. For DoneState, attest only a sealed v2 handoff and return the signed result for separate submission; OpsTruth never calls DoneState or changes its run. Never ask for credentials, infer build success from static files or mutate the target. Use the render tool only after a data tool returns a final report.";

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleRpc(payload, request, env, ctx, options = {}) {
  if (!payload || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return rpcError(payload?.id, -32600, "Invalid Request");
  }
  const { id, method, params = {} } = payload;
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
      serverInfo: SERVER,
      instructions: INSTRUCTIONS,
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOL_DEFINITIONS });
  if (method === "resources/list") {
    return rpcResult(id, { resources: [{ uri: EVIDENCE_UI_URI, name: "OpsTruth evidence report", description: "Interactive structured evidence summary", mimeType: "text/html;profile=mcp-app" }] });
  }
  if (method === "resources/read") {
    if (params.uri !== EVIDENCE_UI_URI) return rpcError(id, -32002, "Resource not found");
    return rpcResult(id, { contents: [evidenceResource(new URL(request.url).origin)] });
  }
  if (method === "tools/call") {
    if (!params.name || typeof params.name !== "string") return rpcError(id, -32602, "Tool name required");
    const started = Date.now();
    try {
      const toolResult = await callTool(params.name, params.arguments || {}, env, ctx, options);
      const response = rpcResult(id, toolResult);
      recordToolEvent(env, ctx, request, { tool: params.name, outcome: "success", status: 200, latencyMs: Date.now() - started, ...summarizeToolResult(toolResult) });
      return response;
    } catch (error) {
      recordToolEvent(env, ctx, request, { tool: params.name, outcome: "error", status: 200, latencyMs: Date.now() - started });
      return rpcResult(id, {
        isError: true,
        content: [{ type: "text", text: `OpsTruth could not complete the read-only check: ${asErrorMessage(error)}` }],
        structuredContent: { status: "blocked", error: asErrorMessage(error), changedState: false },
      });
    }
  }
  if (method.startsWith("notifications/")) return null;
  return rpcError(id, -32601, "Method not found");
}

function corsHeaders(request) {
  const requested = request.headers.get("access-control-request-headers");
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": requested || "content-type, mcp-protocol-version, mcp-session-id",
    "access-control-expose-headers": "mcp-session-id",
  };
}

async function mcpResponse(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", allowed: ["POST", "OPTIONS"] }, 405, { allow: "POST, OPTIONS", ...corsHeaders(request) });
  }
  const maxBodyBytes = 1024 * 1024 + 64 * 1024;
  if (Number(request.headers.get("content-length") || 0) > maxBodyBytes) {
    return jsonResponse(rpcError(null, -32600, "Request body exceeds the bounded MCP limit"), 413, corsHeaders(request));
  }
  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) return jsonResponse(rpcError(null, -32600, "Request body exceeds the bounded MCP limit"), 413, corsHeaders(request));
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400, corsHeaders(request));
  }
  const result = await handleRpc(payload, request, env, ctx);
  if (result === null) return new Response(null, { status: 202, headers: corsHeaders(request) });
  return jsonResponse(result, 200, { ...corsHeaders(request), "mcp-protocol-version": "2025-06-18" });
}

async function fetchHandler(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/mcp") return mcpResponse(request, env, ctx);
  if (url.pathname === "/feedback") {
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed", allowed: ["POST"] }, 405, { allow: "POST" });
    if (Number(request.headers.get("content-length") || 0) > 1024) return jsonResponse({ error: "feedback_too_large" }, 413);
    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1024) return jsonResponse({ error: "feedback_too_large" }, 413);
      payload = JSON.parse(raw);
    } catch { return jsonResponse({ error: "feedback_invalid" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !["reason", "surface"].includes(key))) {
      return jsonResponse({ error: "feedback_invalid" }, 400);
    }
    try {
      const recorded = recordFeedbackEvent(env, ctx, { reason: payload.reason, surface: payload.surface });
      return jsonResponse({ status: recorded ? "accepted" : "not_configured", retainedFields: recorded ? ["reason", "surface", "version"] : [] }, recorded ? 202 : 503);
    } catch (error) {
      return jsonResponse({ error: asErrorMessage(error) }, 400);
    }
  }
  if (url.pathname === "/health") {
    const signing = await signingMetadata(env);
    return jsonResponse({
      status: "ok",
      service: SERVER.name,
      version: SERVER.version,
      commit: env?.OPSTRUTH_BUILD_COMMIT || null,
      tools: TOOL_DEFINITIONS.length,
      evidenceGraph: "1.0.0",
      mode: "read-only-public-evidence",
      evidenceSigning: signing.status,
      analytics: env?.OPSTRUTH_ANALYTICS ? "configured" : "not_configured",
      githubVerification: githubAppHealth(env),
    });
  }
  if (url.pathname === "/signing-key") {
    const signing = await signingMetadata(env);
    return jsonResponse({
      status: signing.status,
      configured: signing.configured,
      algorithm: signing.algorithm,
      signerFingerprint: signing.signerFingerprint,
      doneStateSignerFingerprint: signing.signerFingerprint?.replace(/^sha256:/, "") || null,
      publicKeyPem: signing.publicKeyPem,
    }, signing.configured ? 200 : 503);
  }
  if (url.pathname === "/.well-known/openai-apps-challenge") {
    if (!env?.OPENAI_APPS_CHALLENGE) return new Response("Not configured", { status: 404 });
    return new Response(env.OPENAI_APPS_CHALLENGE, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  if (url.pathname === "/privacy") return htmlResponse(privacyPage());
  if (url.pathname === "/terms") return htmlResponse(termsPage());
  if (url.pathname === "/support") return htmlResponse(supportPage());
  if (url.pathname === "/" || url.pathname === "/index.html") return htmlResponse(landingPage(url.origin));
  return jsonResponse({ error: "not_found" }, 404);
}

export default { fetch: fetchHandler };
export { fetchHandler, handleRpc };
