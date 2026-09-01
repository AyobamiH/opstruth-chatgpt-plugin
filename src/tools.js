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
import { probeDeployment } from "./deployment.js";
import { verifyDoneStateHandoff } from "./donestate.js";
import { buildEvidenceGraph, compareEvidenceGraphs } from "./evidence-graph.js";
import { loadRepositorySnapshot } from "./github.js";
import { verifyExecutionOutcome } from "./post-execution.js";
import { verifyAgentProofReceipt, verifyOpsTruthEvidenceReceipt } from "./receipt.js";
import { prepareSandboxVerification } from "./sandbox.js";
import { validateJsonSchema } from "./schema-validation.js";
import { EVIDENCE_UI_URI } from "./ui.js";
import { evidenceReceipt, signingMetadata, textResult } from "./utils.js";
import { PLUGIN_VERSION } from "./version.js";

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
const TRUSTED_SIGNERS = {
  type: "array",
  maxItems: 50,
  uniqueItems: true,
  items: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
};

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
  tool(
    "opstruth_get_verifier_identity",
    "Get verifier identity",
    "Use this before creating a DoneState objective that requires terminal independent verification. It returns only OpsTruth's configured public Ed25519 identity and compatible fingerprints, never a private key, trust decision or verification result.",
    { type: "object", additionalProperties: false, properties: {} },
  ),
  tool("opstruth_inspect_repository", "Inspect repository", "Use this when you need a quick evidence map of a public GitHub repository before planning changes. It returns identity, structure, manifests, workflows, tests and proof gaps without executing code. Do not use it to inspect private repositories or claim a build passed."),
  tool("opstruth_audit_repository", "Audit repository", "Use this for a broad, read-only evidence audit of a public GitHub repository, including readiness questions. Prefer a narrower tool for one concern. Never use it to modify, deploy or execute the repository."),
  tool("opstruth_trace_routes", "Trace application routes", "Use this when you need statically visible page, API or declared route patterns in a public GitHub repository. It cannot prove live reachability, authentication, middleware behaviour or runtime correctness."),
  tool("opstruth_audit_environment", "Audit environment references", "Use this to list visible environment variable names, configuration paths and package scripts. Environment values and secret-file contents are never read; do not request credentials through this tool."),
  tool("opstruth_audit_secrets", "Audit secret exposure risk", "Use this for a bounded public-source scan of selected secret-like patterns. It returns only redacted types and locations, never values. It is not a complete history or credential-validity scan."),
  tool("opstruth_review_api_contracts", "Review API contracts", "Use this to inventory visible API handlers and OpenAPI, GraphQL, schema or contract paths. It does not call, mutate or validate a deployed API and cannot prove consumer compatibility."),
  tool("opstruth_review_migrations", "Review migrations", "Use this to review visible migration files and static risk indicators before a database change. It never connects to or changes a database and cannot prove applied state or rollback safety."),
  tool("opstruth_check_github_handoff", "Check GitHub handoff", "Use this when release confidence depends on current public GitHub Actions, check runs, commit status, branch protection or handoff files. It is read-only and cannot approve, merge, push or change GitHub."),
  tool("opstruth_check_deployment", "Check deployment readiness", "Use this for a static deployment preflight based on visible configuration and package scripts. It does not build, deploy, call provider APIs or prove live health."),
  tool(
    "opstruth_probe_deployment",
    "Probe deployment health",
    "Use this only when the user supplies a public HTTPS deployment URL and asks for a bounded health check. It retains status and headers but no response body; it rejects credentials, localhost, IP literals and non-HTTPS URLs. It does not deploy or diagnose private provider state.",
    {
      type: "object",
      additionalProperties: false,
      required: ["deployment_url"],
      properties: {
        deployment_url: { type: "string", minLength: 9, maxLength: 300, pattern: "^https://" },
        health_paths: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 200, pattern: "^/" },
        },
      },
    },
    { annotations: { ...READ_ONLY, openWorldHint: true } },
  ),
  tool(
    "opstruth_prepare_sandbox_verification",
    "Prepare sandbox verification",
    "Use this when the user needs a plan to verify a repository build or tests in a separately connected isolated runner. It only prepares an approval-gated handoff from declared scripts and never executes code, installs dependencies or accepts credentials.",
    {
      type: "object",
      additionalProperties: false,
      required: ["repository_url"],
      properties: {
        repository_url: REPOSITORY_INPUT.properties.repository_url,
        objective: { type: ["string", "null"], maxLength: 1000 },
      },
    },
  ),
  tool(
    "opstruth_discover_capabilities",
    "Discover existing capabilities",
    "Use this when you are unsure which read-only OpsTruth capability fits a concrete coding outcome. It recommends one bounded capability only and does not invoke tools, modify repositories or authorise actions.",
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
    "Use this to create a bounded verification sequence with checkpoints and approval gates for a coding objective. It plans only; it does not execute, approve, deploy, merge or authorise actions.",
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
    "Use this when an AgentProof signed receipt v2 is supplied and its structure, digest, signature or signer trust needs checking. It never executes or repeats the underlying action and does not infer that a valid receipt proves the action was safe.",
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
    "opstruth_verify_evidence_receipt",
    "Verify OpsTruth evidence receipt",
    "Use this when an OpsTruth evidence report receipt is supplied and its digest, Ed25519 signature or signer trust needs independent checking. It never repeats the inspection or probe and does not turn evidence into a deployment approval.",
    {
      type: "object",
      additionalProperties: false,
      required: ["report"],
      properties: {
        report: { type: "object", additionalProperties: true },
        trusted_signer_fingerprints: {
          type: "array",
          maxItems: 50,
          items: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        },
      },
    },
  ),
  tool(
    "opstruth_snapshot_evidence",
    "Snapshot subject-bound evidence",
    "Use this to bind public repository, current CI and optional explicitly supplied public HTTPS runtime observations into one portable signed Evidence Graph. It never executes repository code, stores the graph or claims that a reachable endpoint proves which commit is deployed.",
    {
      type: "object",
      additionalProperties: false,
      required: ["repository_url"],
      properties: {
        repository_url: REPOSITORY_INPUT.properties.repository_url,
        deployment_url: { type: ["string", "null"], maxLength: 300, pattern: "^https://" },
        health_paths: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 200, pattern: "^/" } },
        protocol_artifacts: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: true } },
      },
    },
    { annotations: { ...READ_ONLY, openWorldHint: true } },
  ),
  tool(
    "opstruth_compare_snapshots",
    "Compare evidence snapshots",
    "Use this to compare two caller-held OpsTruth Evidence Graph v1 snapshots. It checks graph integrity, signer trust and subject compatibility before reporting deterministic node, edge, contradiction and verdict changes. It performs no network request and stores nothing.",
    {
      type: "object",
      additionalProperties: false,
      required: ["before", "after"],
      properties: {
        before: { type: "object", additionalProperties: true },
        after: { type: "object", additionalProperties: true },
        trusted_signer_fingerprints: TRUSTED_SIGNERS,
      },
    },
  ),
  tool(
    "opstruth_verify_execution_result",
    "Verify execution result",
    "Use this after a separately authorised executor returns a signed receipt. OpsTruth validates the request, authorisation and receipt chain against separate authorizer and executor fingerprint allowlists, enforces signer-role separation, freshly re-observes public repository, CI and optional HTTPS evidence, then signs an independent VerificationResult. Executor success alone can never produce VERIFIED.",
    {
      type: "object",
      additionalProperties: false,
      required: ["repository_url", "request", "authorization", "receipt", "trusted_authorizer_fingerprints", "trusted_executor_fingerprints"],
      properties: {
        repository_url: REPOSITORY_INPUT.properties.repository_url,
        deployment_url: { type: ["string", "null"], maxLength: 300, pattern: "^https://" },
        health_paths: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 200, pattern: "^/" } },
        request: { type: "object", additionalProperties: true },
        authorization: { type: "object", additionalProperties: true },
        receipt: { type: "object", additionalProperties: true },
        trusted_authorizer_fingerprints: TRUSTED_SIGNERS,
        trusted_executor_fingerprints: TRUSTED_SIGNERS,
      },
    },
    { annotations: { ...READ_ONLY, openWorldHint: true } },
  ),
  tool(
    "opstruth_attest_donestate_handoff",
    "Attest DoneState handoff",
    "Use this only with a sealed DoneState verification handoff v2. OpsTruth validates its digest and exact subject, freshly reads the public GitHub commit, evaluates every sealed machine-checkable requirement, and returns a signed attestation for separate submission to DoneState. It never trusts executor success, submits the attestation, or changes the repository.",
    {
      type: "object",
      additionalProperties: false,
      required: ["handoff"],
      properties: {
        handoff: { type: "object", additionalProperties: true },
      },
    },
    { annotations: { ...READ_ONLY, openWorldHint: true } },
  ),
  tool(
    "opstruth_render_evidence",
    "Render evidence report",
    "Use this only after another OpsTruth data tool returned a report that should be presented as an interactive evidence summary. It does not fetch new evidence, execute code or change the supplied report.",
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
  ["opstruth_prepare_sandbox_verification", (snapshot, args) => prepareSandboxVerification(snapshot, args.objective || null)],
]);

async function withReceipt(report, env = {}) {
  return { ...report, receipt: await evidenceReceipt(report, env) };
}

function summary(report) {
  const repository = report.repository?.fullName ? ` for ${report.repository.fullName}` : "";
  const warnings = Array.isArray(report.warnings) ? report.warnings.length : 0;
  const failures = Array.isArray(report.failures) ? report.failures.length : 0;
  return `OpsTruth ${report.skill?.name || report.status || "result"}${repository}: ${warnings} warning(s), ${failures} failure(s), no state changed.`;
}

export async function callTool(name, args = {}, env = {}, ctx = {}, options = {}) {
  const observedAt = new Date(options.observedAt || Date.now()).toISOString();
  const inputBytes = new TextEncoder().encode(JSON.stringify(args)).byteLength;
  if (inputBytes > 1024 * 1024) throw new Error("tool_input_exceeds_1_mib");
  const definition = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error("tool_not_found");
  const inputErrors = validateJsonSchema(args, definition.inputSchema);
  if (inputErrors.length) throw new Error(`tool_input_invalid:${inputErrors.slice(0, 10).join("|")}`);
  if (name === "opstruth_get_verifier_identity") {
    const identity = await signingMetadata(env);
    if (!identity.configured) throw new Error("opstruth_signing_identity_required");
    const report = {
      schema: "opstruth.verifier-identity.v1",
      algorithm: identity.algorithm,
      signerFingerprint: identity.signerFingerprint,
      doneStateSignerFingerprint: identity.signerFingerprint.slice("sha256:".length),
      publicKeyPem: identity.publicKeyPem,
      changedState: false,
    };
    return textResult(report, "OpsTruth verifier identity: " + report.signerFingerprint + ". No trust decision was made and no state changed.");
  }
  if (REPOSITORY_HANDLERS.has(name)) {
    const snapshot = await loadRepositorySnapshot(args.repository_url, env, ctx);
    const report = await withReceipt(await REPOSITORY_HANDLERS.get(name)(snapshot, args), env);
    return textResult(report, summary(report));
  }
  if (name === "opstruth_probe_deployment") {
    const report = await withReceipt(await probeDeployment(args), env);
    return textResult(report, `OpsTruth deployment probe: ${report.status}. ${report.probes.length} public HTTPS path(s) checked, no state changed.`);
  }
  if (name === "opstruth_discover_capabilities") {
    const report = await withReceipt({
      ...discoverCapabilities(args.objective),
      changedState: { changed: false, summary: "Recommendation only." },
      provenance: ["capability-intelligence@6ca93fb", `opstruth-chatgpt-plugin@${PLUGIN_VERSION}`],
    }, env);
    return textResult(report, `OpsTruth capability recommendation: ${report.recommendation?.tool || report.status}. No capability was invoked.`);
  }
  if (name === "opstruth_plan_workflow") {
    const report = await withReceipt({
      ...planWorkflow(args.objective, args.repository_url || null),
      changedState: { changed: false, summary: "Planning only." },
      provenance: ["autonomous-coding-workflow-library@0dca8cc", `opstruth-chatgpt-plugin@${PLUGIN_VERSION}`],
    }, env);
    return textResult(report, `OpsTruth planned ${report.stages.length} verification stage(s). No stage was executed.`);
  }
  if (name === "opstruth_verify_receipt") {
    const report = await verifyAgentProofReceipt(args.document, args.trusted_signer_fingerprints || []);
    return textResult(report, `AgentProof receipt verification: ${report.reason}. Cryptographically valid: ${report.cryptographicallyValid}. Trusted: ${report.trusted}.`);
  }
  if (name === "opstruth_verify_evidence_receipt") {
    const report = await verifyOpsTruthEvidenceReceipt(args.report, args.trusted_signer_fingerprints || []);
    return textResult(report, `OpsTruth evidence receipt verification: ${report.reason}. Cryptographically valid: ${report.cryptographicallyValid}. Trusted: ${report.trusted}.`);
  }
  if (name === "opstruth_snapshot_evidence") {
    const snapshot = await loadRepositorySnapshot(args.repository_url, env, ctx);
    const deploymentReport = args.deployment_url
      ? await probeDeployment({ deployment_url: args.deployment_url, health_paths: args.health_paths })
      : null;
    const graph = await buildEvidenceGraph({
      repositorySnapshot: snapshot,
      deploymentReport,
      protocolArtifacts: args.protocol_artifacts || [],
      observedAt,
      env,
    });
    const scopeStatement = graph.nodes.find((node) => node.type === "finding" && node.attributes?.kind === "assessment_scope")?.attributes?.statement
      || "Release readiness remains unproven.";
    return textResult(graph, `OpsTruth evidence snapshot: ${graph.summary.verdict}. ${scopeStatement} ${graph.nodes.length} node(s), ${graph.edges.length} edge(s), no state changed.`);
  }
  if (name === "opstruth_compare_snapshots") {
    const delta = await compareEvidenceGraphs(args.before, args.after, {
      comparedAt: observedAt,
      trustedSignerFingerprints: args.trusted_signer_fingerprints || [],
    });
    return textResult(delta, `OpsTruth evidence delta: ${delta.verdictTransition.from} to ${delta.verdictTransition.to}. No state changed.`);
  }
  if (name === "opstruth_verify_execution_result") {
    const snapshot = await loadRepositorySnapshot(args.repository_url, env, ctx);
    const deploymentReport = args.deployment_url
      ? await probeDeployment({ deployment_url: args.deployment_url, health_paths: args.health_paths })
      : null;
    const verification = await verifyExecutionOutcome({
      request: args.request,
      authorization: args.authorization,
      receipt: args.receipt,
      repositorySnapshot: snapshot,
      deploymentReport,
      trustedAuthorizerFingerprints: args.trusted_authorizer_fingerprints,
      trustedExecutorFingerprints: args.trusted_executor_fingerprints,
      observedAt,
      env,
    });
    return textResult(verification, `OpsTruth post-execution verification: ${verification.result.verdict}. Executor claims were independently checked; no state changed.`);
  }
  if (name === "opstruth_attest_donestate_handoff") {
    const verification = await verifyDoneStateHandoff(args.handoff, env, ctx, { observedAt });
    return textResult(
      verification,
      `OpsTruth DoneState verification: ${verification.report.decision}. The sealed public subject was independently checked; the attestation was not submitted and no state changed.`,
    );
  }
  if (name === "opstruth_render_evidence") {
    const report = args.report && typeof args.report === "object" ? args.report : null;
    if (!report) throw new Error("report_required");
    return textResult(report, "Rendered the supplied OpsTruth evidence report without changing it.");
  }
  throw new Error("tool_handler_not_found");
}
