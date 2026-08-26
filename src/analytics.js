import { PLUGIN_VERSION } from "./version.js";

const SAFE_VALUE = /^[a-z0-9_:-]{1,96}$/;

function safeValue(value, fallback) {
  const candidate = String(value || "").toLowerCase();
  return SAFE_VALUE.test(candidate) ? candidate : fallback;
}

/**
 * Classify only a coarse client family. Raw headers, prompts, URLs and IPs
 * are deliberately never persisted. ChatGPT does not expose a stable user
 * identifier to an unauthenticated public MCP server, so this is not a user
 * counter.
 */
export function classifyClient(request) {
  const userAgent = String(request?.headers?.get?.("user-agent") || "");
  const origin = String(request?.headers?.get?.("origin") || "");
  let originHost = "";
  try { originHost = new URL(origin || "https://unknown.invalid").hostname; } catch { /* coarse analytics must fail closed */ }
  if (/chatgpt|openai/i.test(userAgent) || /(?:^|\.)chatgpt\.com$/i.test(originHost)) return "chatgpt";
  if (/codex/i.test(userAgent)) return "codex";
  return "mcp";
}

export function analyticsPoint({ tool, outcome, status, latencyMs, client }) {
  return {
    indexes: [safeValue(tool, "unknown")],
    blobs: [
      "tool_call",
      safeValue(tool, "unknown"),
      safeValue(outcome, "unknown"),
      safeValue(client, "mcp"),
      PLUGIN_VERSION,
    ],
    doubles: [
      Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0,
      Number.isFinite(status) ? status : 0,
    ],
  };
}

/**
 * Analytics is best-effort and never delays or changes an MCP response.
 * Analytics Engine creates the dataset on its first write when the binding is
 * configured in wrangler.jsonc.
 */
export function recordToolEvent(env, ctx, request, event) {
  const binding = env?.OPSTRUTH_ANALYTICS;
  if (!binding || typeof binding.writeDataPoint !== "function") return;
  const write = Promise.resolve().then(() => binding.writeDataPoint(analyticsPoint({
    ...event,
    client: classifyClient(request),
  }))).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(write);
}
