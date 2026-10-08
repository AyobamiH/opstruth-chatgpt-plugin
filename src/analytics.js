import { PLUGIN_VERSION } from "./version.js";
import { TOOL_DEFINITIONS } from "./tools.js";

const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
const OUTCOMES = new Set(["success", "error"]);
const CLIENTS = new Set(["chatgpt", "codex", "mcp"]);
const ERROR_CATEGORIES = new Set(["none", "tool_not_found", "input_invalid", "signing_unavailable", "other"]);
const VERDICTS = new Set(["verified", "partial", "contradicted", "unproven", "ready_for_live_validation", "insufficient_evidence", "not_ready", "blocked", "none"]);
const FEEDBACK_REASONS = new Set(["useful", "missed_evidence", "false_warning", "unclear_result", "incorrect_binding"]);
const FEEDBACK_SURFACES = new Set(["chatgpt", "codex", "mcp", "website"]);

export function shouldRecordAnalytics(request) {
  return request?.headers?.get?.("dnt") !== "1" && request?.headers?.get?.("sec-gpc") !== "1";
}

export function classifyToolError(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "tool_not_found" || message === "tool_handler_not_found") return "tool_not_found";
  if (message.startsWith("tool_input_invalid:") || message === "tool_input_exceeds_1_mib") return "input_invalid";
  if (message === "opstruth_signing_identity_required") return "signing_unavailable";
  return "other";
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

function boundedCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function normalVerdict(value) {
  const normalized = String(value || "none").toLowerCase();
  return VERDICTS.has(normalized) ? normalized : "none";
}

export function analyticsPoint({ tool, outcome, status, latencyMs, client, verdict, counts = {}, ciObserved = false, deploymentProbed = false, signedEvidence = false, errorCategory = "none" }) {
  return {
    indexes: [TOOL_NAMES.has(tool) ? tool : "unknown"],
    blobs: [
      "tool_call",
      TOOL_NAMES.has(tool) ? tool : "unknown",
      OUTCOMES.has(outcome) ? outcome : "unknown",
      CLIENTS.has(client) ? client : "mcp",
      PLUGIN_VERSION,
      normalVerdict(verdict),
      ciObserved ? "ci_observed" : "ci_not_observed",
      deploymentProbed ? "deployment_probed" : "deployment_not_probed",
      signedEvidence ? "evidence_signed" : "evidence_unsigned",
      outcome !== "error" ? "none" : ERROR_CATEGORIES.has(errorCategory) && errorCategory !== "none" ? errorCategory : "other",
    ],
    doubles: [
      Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0,
      Number.isFinite(status) ? status : 0,
      boundedCount(counts.evidence),
      boundedCount(counts.warnings),
      boundedCount(counts.failures),
      boundedCount(counts.notVerified),
    ],
  };
}

export function summarizeToolResult(toolResult) {
  const report = toolResult?.structuredContent || {};
  const nodes = Array.isArray(report.nodes) ? report.nodes : Array.isArray(report.evidenceGraph?.nodes) ? report.evidenceGraph.nodes : [];
  const verdict = report.summary?.verdict || report.result?.verdict || report.verdict?.code || report.verdict || "none";
  return {
    verdict,
    counts: {
      evidence: Array.isArray(report.evidence) ? report.evidence.length : nodes.length,
      warnings: Array.isArray(report.warnings) ? report.warnings.length : Array.isArray(report.result?.warnings) ? report.result.warnings.length : 0,
      failures: Array.isArray(report.failures) ? report.failures.length : Array.isArray(report.result?.errors) ? report.result.errors.length : 0,
      notVerified: Array.isArray(report.notVerified) ? report.notVerified.length : Array.isArray(report.result?.notVerified) ? report.result.notVerified.length : report.summary?.counts?.unproven || 0,
    },
    ciObserved: nodes.some((node) => node.type === "ci_run") || Boolean(report.githubHandoff?.publicGithubStatus?.workflowRuns?.available),
    deploymentProbed: nodes.some((node) => node.type === "runtime_observation") || Array.isArray(report.probes),
    signedEvidence: Boolean(report.proof || report.receipt?.signed || report.evidenceGraph?.proof || report.result?.proof),
  };
}

export function feedbackPoint({ reason, surface }) {
  if (!FEEDBACK_REASONS.has(reason)) throw new Error("feedback_reason_invalid");
  if (!FEEDBACK_SURFACES.has(surface)) throw new Error("feedback_surface_invalid");
  return {
    indexes: ["feedback"],
    blobs: ["feedback", reason, surface, PLUGIN_VERSION],
    doubles: [1],
  };
}

/**
 * Analytics is best-effort and never delays or changes an MCP response.
 * Analytics Engine creates the dataset on its first write when the binding is
 * configured in wrangler.jsonc.
 */
export function recordToolEvent(env, ctx, request, event) {
  if (!shouldRecordAnalytics(request)) return;
  const binding = env?.OPSTRUTH_ANALYTICS;
  if (!binding || typeof binding.writeDataPoint !== "function") return;
  const write = Promise.resolve().then(() => binding.writeDataPoint(analyticsPoint({
    ...event,
    client: classifyClient(request),
  }))).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(write);
}

export function recordFeedbackEvent(env, ctx, event, request) {
  const point = feedbackPoint(event);
  if (!shouldRecordAnalytics(request)) return false;
  const binding = env?.OPSTRUTH_ANALYTICS;
  if (!binding || typeof binding.writeDataPoint !== "function") return false;
  const write = Promise.resolve().then(() => binding.writeDataPoint(point)).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(write);
  return true;
}
