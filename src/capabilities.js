import { unique } from "./utils.js";

export const CAPABILITIES = [
  { tool: "opstruth_inspect_repository", name: "Repository map", authority: "read", source: "coding-agent-skills", terms: ["repository", "repo", "map", "structure", "entry", "manifest"] },
  { tool: "opstruth_audit_repository", name: "Complete audit", authority: "read", source: "coding-agent-skills", terms: ["audit", "verify", "evidence", "ready", "truth", "complete"] },
  { tool: "opstruth_trace_routes", name: "Route trace", authority: "read", source: "coding-agent-skills", terms: ["route", "routing", "page", "endpoint", "request", "runtime"] },
  { tool: "opstruth_audit_environment", name: "Environment audit", authority: "read", source: "coding-agent-skills", terms: ["environment", "env", "configuration", "config", "variable"] },
  { tool: "opstruth_audit_secrets", name: "Secret-risk audit", authority: "read", source: "coding-agent-skills", terms: ["secret", "credential", "token", "key", "password", "security"] },
  { tool: "opstruth_review_api_contracts", name: "API contract review", authority: "read", source: "coding-agent-skills", terms: ["api", "contract", "openapi", "graphql", "schema", "endpoint"] },
  { tool: "opstruth_review_migrations", name: "Migration review", authority: "read", source: "coding-agent-skills", terms: ["migration", "database", "sql", "schema", "rls", "policy"] },
  { tool: "opstruth_check_github_handoff", name: "GitHub and CI handoff", authority: "read", source: "coding-agent-skills", terms: ["github", "ci", "check", "checks", "pull", "request", "handoff", "workflow", "review"] },
  { tool: "opstruth_check_deployment", name: "Deployment preflight", authority: "read", source: "coding-agent-skills", terms: ["deploy", "deployment", "release", "publish", "cloudflare", "vercel", "hosting"] },
  { tool: "opstruth_probe_deployment", name: "Deployment health probe", authority: "read", source: "opstruth", terms: ["health", "healthy", "live", "reachable", "deployment", "endpoint", "probe"] },
  { tool: "opstruth_prepare_sandbox_verification", name: "Sandbox verification handoff", authority: "plan", source: "coding-workflow-library", terms: ["build", "test", "typecheck", "verify", "execute", "sandbox", "runner", "command"] },
  { tool: "opstruth_plan_workflow", name: "Workflow planner", authority: "plan", source: "coding-workflow-library", terms: ["plan", "workflow", "orchestrate", "sequence", "next", "checkpoint"] },
  { tool: "opstruth_discover_capabilities", name: "Capability discovery", authority: "read", source: "capability-intelligence", terms: ["capability", "discover", "existing", "reuse", "tool", "skill", "mcp"] },
  { tool: "opstruth_verify_receipt", name: "Receipt verifier", authority: "read", source: "agentproof", terms: ["receipt", "signature", "signed", "agentproof", "proof", "trust"] },
  { tool: "opstruth_verify_evidence_receipt", name: "OpsTruth evidence verifier", authority: "read", source: "opstruth", terms: ["receipt", "signature", "signed", "opstruth", "evidence", "proof", "trust"] },
];

const WRITE_TERMS = ["write", "change", "edit", "commit", "push", "merge", "deploy", "publish", "delete", "apply", "execute", "run migration"];

function tokens(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function discoverCapabilities(objective) {
  const requested = String(objective || "").trim();
  const objectiveTokens = tokens(requested);
  if (!objectiveTokens.length) {
    return {
      status: "outcome_too_broad",
      objective: requested,
      recommendation: null,
      alternatives: [],
      nextSafeStep: "Describe a concrete repository outcome.",
      automaticAction: false,
    };
  }
  const ranked = CAPABILITIES.map((capability) => {
    const matched = capability.terms.filter((term) => objectiveTokens.includes(term));
    return { ...capability, score: matched.length, matchedTerms: matched };
  }).filter((capability) => capability.score > 0)
    .sort((left, right) => right.score - left.score || left.tool.localeCompare(right.tool));
  return {
    status: ranked.length ? "candidate_found" : "no_candidate",
    objective: requested,
    recommendation: ranked[0] || null,
    alternatives: ranked.slice(1, 5),
    automaticAction: false,
    boundary: [
      "No capability was installed, authenticated or invoked by this recommendation.",
      "Execution requires a separate tool call and remains read-only in the public plugin.",
    ],
    nextSafeStep: ranked.length
      ? `Inspect the recommendation, then invoke ${ranked[0].tool} only if its scope matches the request.`
      : "Inspect the repository first, then narrow the outcome.",
  };
}

export function planWorkflow(objective, repositoryUrl = null) {
  const requested = String(objective || "").trim();
  if (!requested) throw new Error("objective_required");
  const lower = requested.toLowerCase();
  const mutatingIntent = WRITE_TERMS.filter((term) => lower.includes(term));
  const discovered = discoverCapabilities(requested);
  const selected = unique([
    repositoryUrl ? "opstruth_inspect_repository" : null,
    discovered.recommendation?.tool,
    ...discovered.alternatives.slice(0, 2).map((item) => item.tool),
  ]);
  if (repositoryUrl && !selected.includes("opstruth_audit_repository") && /audit|verify|ready|truth/.test(lower)) {
    selected.push("opstruth_audit_repository");
  }
  return {
    status: "planned",
    objective: requested,
    repositoryUrl,
    authority: mutatingIntent.length ? "read_then_approval_required" : "read_only",
    stages: selected.map((tool, index) => ({ order: index + 1, tool, state: "not_started", changedState: false })),
    approvalGates: mutatingIntent.length
      ? [{ before: "external mutation", reason: `Mutating intent detected: ${mutatingIntent.join(", ")}`, availableInPublicPlugin: false }]
      : [],
    checkpoints: ["repository identity", "evidence collected", "proof gaps classified", "next authority decision"],
    automaticAction: false,
    nextSafeStep: selected.length ? `Begin with ${selected[0]}.` : "Clarify the target and required evidence.",
  };
}
