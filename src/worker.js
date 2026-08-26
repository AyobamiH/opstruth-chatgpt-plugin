import { callTool, TOOL_DEFINITIONS } from "./tools.js";
import { evidenceResource, EVIDENCE_UI_URI } from "./ui.js";
import { asErrorMessage, htmlResponse, jsonResponse, signingMetadata } from "./utils.js";
import { landingPage, privacyPage, supportPage, termsPage } from "./pages.js";
import { recordToolEvent } from "./analytics.js";
import { PLUGIN_VERSION } from "./version.js";

const SERVER = { name: "opstruth", version: PLUGIN_VERSION };
const INSTRUCTIONS = "Use OpsTruth for evidence-first public GitHub and user-supplied HTTPS health checks. Inspect before broad audits, prefer the narrowest matching tool, never ask for credentials, use current public CI evidence when available, never infer build success from static files, and separate verified facts from warnings and proof gaps. Sandbox preparation is a handoff only and requires a separately connected approval-gated runner. Use the render tool only after a data tool returns a final report.";

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleRpc(payload, request, env, ctx) {
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
      const response = rpcResult(id, await callTool(params.name, params.arguments || {}, env, ctx));
      recordToolEvent(env, ctx, request, { tool: params.name, outcome: "success", status: 200, latencyMs: Date.now() - started });
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
  let payload;
  try {
    payload = await request.json();
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
  if (url.pathname === "/health") {
    const signing = await signingMetadata(env);
    return jsonResponse({
      status: "ok",
      service: SERVER.name,
      version: SERVER.version,
      commit: env?.OPSTRUTH_BUILD_COMMIT || null,
      tools: TOOL_DEFINITIONS.length,
      mode: "read-only-public-evidence",
      evidenceSigning: signing.status,
      analytics: env?.OPSTRUTH_ANALYTICS ? "configured" : "not_configured",
    });
  }
  if (url.pathname === "/signing-key") {
    const signing = await signingMetadata(env);
    return jsonResponse({
      status: signing.status,
      configured: signing.configured,
      algorithm: signing.algorithm,
      signerFingerprint: signing.signerFingerprint,
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
