import {
  auditEnvironment,
  auditSecrets,
  checkDeployment,
  checkGithubHandoff,
  fullAudit,
  inspectRepository,
  reviewApiContracts,
  reviewMigrations,
  traceRoutes,
} from "./audits.js";
import { discoverCapabilities, planWorkflow } from "./capabilities.js";
import { loadRepositorySnapshot } from "./github.js";
import { verifyAgentProofReceipt } from "./receipt.js";
import { EVIDENCE_UI_URI } from "./ui.js";
import { evidenceReceipt, textResult } from "./utils.js";

const REPOSITORY_INPUT = {
  type: "object",
  additionalProperties: false,
  required: ["repository_url"],
  properties: {
    repository_url: {
      type: "string",
      minLength: 3,
      maxLength: 240,
      description: "Public GitHub repository as owner/name or https://github.com/owner/name.",
    },
  },
};

const REPORT_OUTPUT = { type: "object", additionalProperties: true };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function tool(name, title, description, inputSchema = REPOSITORY_INPUT, extra = {}) {
  return {
    name,
    title,
    description,
    inputSchema,
    outputSchema: REPORT_OUTPUT,
    annotations: READ_ONLY,
    ...extra,
  };
}

export const TOOL_DEFINITIONS = [
  tool("opstruth_inspect_repository", "Inspect repository", "Map a public GitHub repository before planning changes. Returns repository identity, visible structure, manifests, workflows, tests and proof gaps without executing code."),
  tool("opstruth_audit_repository", "Audit repository", "Run the complete read-only OpsTruth audit for a public GitHub repository. Use for broad evidence and readiness questions rather than one narrow concern."),
  tool("opstruth_trace_routes", "Trace application routes", "Find statically visible page, API and declared route patterns in a public GitHub repository. Does not claim live reachability or runtime behavior."),
  tool("opstruth_audit_environment", "Audit environment references", "List visible environment variable names, configuration paths and package script names without reading environment values or secret files."),
  tool("opstruth_audit_secrets", "Audit secret exposure risk", "Scan bounded public source for selected secret-like patterns. Returns only redacted pattern types and locations, never matched values."),
  tool("opstruth_review_api_contracts", "Review API contracts", "Inventory visible API handlers, OpenAPI, GraphQL, schema and contract paths. Does not call or validate deployed APIs."),
  tool("opstruth_review_migrations", "Review migrations", "Inventory visible migration files and selected static risk indicators without connecting to or changing a database."),
  tool("opstruth_check_github_handoff", "Check GitHub handoff", "Check visible CI workflows, contribution guidance, pull request templates, test script names and handoff evidence without changing GitHub."),
  tool("opstruth_check_deployment", "Check deployment readiness", "Inspect visible deployment configuration, platform indicators and package script names without building, deploying or calling provider APIs."),
  tool(
    "opstruth_discover_capabilities",
    "Discover existing capabilities",
    "Recommend the lowest-authority OpsTruth capability for a concrete coding outcome. This returns a recommendation only and does not invoke another tool.",
    {
      type: "object",
      additionalProperties: false,
      required: ["objective"],
      properties: { objective: { type: "string", minLength: 3, maxLength: 1000 } },
    },
  ),
  tool(
    "opstruth_plan_workflow",
    "Plan verification workflow",
    "Create a bounded verification sequence with checkpoints and approval gates for a coding objective. This plans but does not execute or authorize actions.",
    {
      type: "object",
      additionalProperties: false,
      required: ["objective"],
      properties: {
        objective: { type: "string", minLength: 3, maxLength: 2000 },
        repository_url: { type: ["string", "null"], maxLength: 240 },
      },
    },
  ),
  tool(
    "opstruth_verify_receipt",
    "Verify AgentProof receipt",
    "Verify an AgentProof signed receipt v2 structure, payload digest, Ed25519 signature and optional signer trust without executing or repeating the action.",
    {
      type: "object",
      additionalProperties: false,
      required: ["document"],
      properties: {
        document: { type: "object", additionalProperties: true },
        trusted_signer_fingerprints: {
          type: "array",
          maxItems: 50,
          items: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        },
      },
    },
  ),
  tool(
    "opstruth_render_evidence",
    "Render evidence report",
    "Render a previously returned OpsTruth report as an interactive evidence summary. Always obtain the report from another OpsTruth data tool first.",
    {
      type: "object",
      additionalProperties: false,
      required: ["report"],
      properties: { report: { type: "object", additionalProperties: true } },
    },
    {
      _meta: {
        ui: { resourceUri: EVIDENCE_UI_URI },
        "openai/toolInvocation/invoking": "Rendering evidence…",
        "openai/toolInvocation/invoked": "Evidence rendered.",
      },
    },
  ),
];

const REPOSITORY_HANDLERS = new Map([
  ["opstruth_inspect_repository", inspectRepository],
  ["opstruth_audit_repository", fullAudit],
  ["opstruth_trace_routes", traceRoutes],
  ["opstruth_audit_environment", auditEnvironment],
  ["opstruth_audit_secrets", auditSecrets],
  ["opstruth_review_api_contracts", reviewApiContracts],
  ["opstruth_review_migrations", reviewMigrations],
  ["opstruth_check_github_handoff", checkGithubHandoff],
  ["opstruth_check_deployment", checkDeployment],
]);

async function withReceipt(report) {
  return { ...report, receipt: await evidenceReceipt(report) };
}

function summary(report) {
  const repository = report.repository?.fullName ? ` for ${report.repository.fullName}` : "";
  const warnings = Array.isArray(report.warnings) ? report.warnings.length : 0;
  const failures = Array.isArray(report.failures) ? report.failures.length : 0;
  return `OpsTruth ${report.skill?.name || report.status || "result"}${repository}: ${warnings} warning(s), ${failures} failure(s), no state changed.`;
}

export async function callTool(name, args = {}, env = {}, ctx = {}) {
  if (REPOSITORY_HANDLERS.has(name)) {
    const snapshot = await loadRepositorySnapshot(args.repository_url, env, ctx);
    const report = await withReceipt(REPOSITORY_HANDLERS.get(name)(snapshot));
    return textResult(report, summary(report));
  }
  if (name === "opstruth_discover_capabilities") {
    const report = await withReceipt({
      ...discoverCapabilities(args.objective),
      changedState: { changed: false, summary: "Recommendation only." },
      provenance: ["capability-intelligence@6ca93fb", "opstruth-chatgpt-plugin@0.2.0"],
    });
    return textResult(report, `OpsTruth capability recommendation: ${report.recommendation?.tool || report.status}. No capability was invoked.`);
  }
  if (name === "opstruth_plan_workflow") {
    const report = await withReceipt({
      ...planWorkflow(args.objective, args.repository_url || null),
      changedState: { changed: false, summary: "Planning only." },
      provenance: ["autonomous-coding-workflow-library@0dca8cc", "opstruth-chatgpt-plugin@0.2.0"],
    });
    return textResult(report, `OpsTruth planned ${report.stages.length} verification stage(s). No stage was executed.`);
  }
  if (name === "opstruth_verify_receipt") {
    const report = await verifyAgentProofReceipt(args.document, args.trusted_signer_fingerprints || []);
    return textResult(report, `AgentProof receipt verification: ${report.reason}. Cryptographically valid: ${report.cryptographicallyValid}. Trusted: ${report.trusted}.`);
  }
  if (name === "opstruth_render_evidence") {
    const report = args.report && typeof args.report === "object" ? args.report : null;
    if (!report) throw new Error("report_required");
    return textResult(report, "Rendered the supplied OpsTruth evidence report without changing it.");
  }
  throw new Error("tool_not_found");
}
