import { canonicalDigest, canonicalJson, withoutFields } from "./canonical.js";
import { signProtocolArtifact, verifyProtocolArtifact } from "./protocol.js";

export const GRAPH_SCHEMA = "opstruth.evidence-graph";
export const GRAPH_VERSION = "1.0.0";
export const GRAPH_LIMITS = Object.freeze({ maxNodes: 256, maxEdges: 512, maxSnapshotBytes: 512 * 1024 });

const NODE_DOMAIN = "opstruth.evidence-node.v1\0";
const EDGE_DOMAIN = "opstruth.evidence-edge.v1\0";
const GRAPH_ID_DOMAIN = "opstruth.evidence-graph-id.v1\0";
const DELTA_DOMAIN = "opstruth.evidence-delta.v1\0";
const NODE_TYPES = new Set([
  "repository", "commit", "branch", "pull_request", "ci_run", "artifact", "deployment",
  "runtime_observation", "configuration", "finding", "action_request", "action_authorization",
  "execution_receipt", "verification_result",
]);
const EDGE_TYPES = new Set([
  "contains", "derived_from", "tested_by", "produced", "deployed_as", "observed_by",
  "addresses", "claims", "authorizes", "verifies", "contradicts", "supersedes",
]);
const VERDICTS = new Set(["VERIFIED", "PARTIAL", "CONTRADICTED", "UNPROVEN"]);
const RELEASE_SCOPE = Object.freeze([
  "branch_protection",
  "deployment_commit_binding",
  "migration_coverage",
  "migration_safety",
  "publication_state",
  "release_readiness",
  "rollback_viability",
  "runtime_correctness",
  "runtime_reachability",
]);

function isoTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("observation_time_invalid");
  return date.toISOString();
}

function freshUntil(observedAt, minutes = 5) {
  return new Date(Date.parse(observedAt) + minutes * 60 * 1000).toISOString();
}

function safeIdPart(value) {
  return encodeURIComponent(String(value ?? "unknown")).replaceAll("%", ".");
}

function nodeId(type, ...parts) {
  return `urn:opstruth:node:${type}:${parts.map(safeIdPart).join(":")}`;
}

function edgeId(type, from, to, suffix = "evidence") {
  return `urn:opstruth:edge:${type}:${safeIdPart(from)}:${safeIdPart(to)}:${safeIdPart(suffix)}`;
}

async function evidenceNode(value) {
  if (!NODE_TYPES.has(value.type)) throw new Error(`evidence_node_type_unknown:${value.type}`);
  const payload = withoutFields(value, ["digest"]);
  return { ...payload, digest: await canonicalDigest(NODE_DOMAIN, payload) };
}

async function evidenceEdge(value) {
  if (!EDGE_TYPES.has(value.type)) throw new Error(`evidence_edge_type_unknown:${value.type}`);
  const payload = withoutFields(value, ["digest"]);
  return { ...payload, digest: await canonicalDigest(EDGE_DOMAIN, payload) };
}

function source(provider, reference = null) {
  return { provider, ...(reference ? { reference } : {}) };
}

function authority(kind = "public") {
  return { kind, permissions: kind === "public" ? ["public_read"] : ["contents_read", "metadata_read", "actions_read", "pull_requests_read"] };
}

function assertion(assertionId, verdict, explanation, evidenceNodeIds = [], expected = true, observed = null) {
  return { assertionId, verdict, expected, observed, evidenceNodeIds: [...new Set(evidenceNodeIds)].sort(), explanation };
}

function overallVerdict(assertions, contradictions) {
  if (contradictions.length || assertions.some((item) => item.verdict === "CONTRADICTED")) return "CONTRADICTED";
  if (assertions.length && assertions.every((item) => item.verdict === "VERIFIED")) return "VERIFIED";
  if (assertions.some((item) => item.verdict === "VERIFIED")) return "PARTIAL";
  return "UNPROVEN";
}

function assessedScope(nodes) {
  const assessed = ["ci_commit_binding", "repository_head", "repository_identity"];
  if (matching(nodes, "runtime_observation").length) assessed.push("deployment_commit_binding", "runtime_reachability");
  if (matching(nodes, "action_request").length || matching(nodes, "action_authorization").length
    || matching(nodes, "execution_receipt").length || matching(nodes, "verification_result").length) {
    assessed.push("protocol_artifact_integrity");
  }
  return [...new Set(assessed)].sort();
}

function graphScope(nodes) {
  const assessed = assessedScope(nodes);
  return {
    assessed,
    notAssessed: RELEASE_SCOPE.filter((dimension) => !assessed.includes(dimension)),
  };
}

function matching(nodes, type) {
  return nodes.filter((node) => node.type === type);
}

function contradiction(rule, description, left, right) {
  return { rule, description, nodeIds: [left.id, right.id].sort() };
}

export function detectContradictions(nodes) {
  const contradictions = [];
  const commits = matching(nodes, "commit");
  const expectedCommit = commits.find((node) => node.attributes?.role === "observed_head");
  for (const ci of matching(nodes, "ci_run").filter((node) => node.attributes?.currentRelease === true)) {
    if (expectedCommit?.attributes?.sha && ci.attributes?.headCommitSha && ci.attributes.headCommitSha !== expectedCommit.attributes.sha) {
      contradictions.push(contradiction("ci_commit_mismatch", "The current CI run is bound to a different commit.", expectedCommit, ci));
    }
  }

  const artifacts = matching(nodes, "artifact");
  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < artifacts.length; rightIndex += 1) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      if (left.attributes?.releaseAssertion && left.attributes.releaseAssertion === right.attributes?.releaseAssertion
        && left.attributes?.contentDigest && right.attributes?.contentDigest
        && left.attributes.contentDigest !== right.attributes.contentDigest) {
        contradictions.push(contradiction("artifact_digest_mismatch", "Sources claim different artifact digests for the same release assertion.", left, right));
      }
    }
  }

  const deployments = matching(nodes, "deployment").filter((node) => node.attributes?.active === true);
  for (let leftIndex = 0; leftIndex < deployments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < deployments.length; rightIndex += 1) {
      const left = deployments[leftIndex];
      const right = deployments[rightIndex];
      if (left.attributes?.environment && left.attributes.environment === right.attributes?.environment
        && left.attributes?.commitSha && right.attributes?.commitSha
        && left.attributes.commitSha !== right.attributes.commitSha) {
        contradictions.push(contradiction("active_deployment_mismatch", "Two active revisions conflict for a single-slot environment.", left, right));
      }
    }
  }

  const routes = matching(nodes, "configuration").filter((node) => node.attributes?.kind === "declared_route");
  const probes = matching(nodes, "runtime_observation");
  for (const route of routes) {
    const probe = probes.find((item) => item.attributes?.path === route.attributes?.path);
    if (probe && probe.attributes?.deploymentRef === route.attributes?.deploymentRef && probe.attributes?.ok === false) {
      contradictions.push(contradiction("declared_route_runtime_absent", "A declared route is absent from the bound fresh runtime observation.", route, probe));
    }
  }

  const requests = matching(nodes, "action_request");
  for (const receipt of matching(nodes, "execution_receipt")) {
    const request = requests.find((item) => item.attributes?.requestId === receipt.attributes?.requestId) || requests[0];
    if (request?.attributes?.digest && receipt.attributes?.requestDigest && request.attributes.digest !== receipt.attributes.requestDigest) {
      contradictions.push(contradiction("receipt_request_mismatch", "The execution receipt is bound to a different ActionRequest digest.", request, receipt));
    }
  }

  const current = nodes.filter((node) => node.attributes?.presentedAsCurrent === true);
  for (const later of nodes.filter((node) => node.attributes?.supersedesNodeId)) {
    const earlier = current.find((node) => node.id === later.attributes.supersedesNodeId);
    if (earlier) contradictions.push(contradiction("superseded_claim_presented_current", "A superseded claim is still presented as current.", earlier, later));
  }
  return contradictions.sort((left, right) => left.rule.localeCompare(right.rule) || left.nodeIds.join("").localeCompare(right.nodeIds.join("")));
}

async function contradictionEdges(contradictions, nodes, observedAt) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];
  for (const item of contradictions) {
    const [from, to] = item.nodeIds;
    if (!byId.has(from) || !byId.has(to)) continue;
    edges.push(await evidenceEdge({
      id: edgeId("contradicts", from, to, item.rule),
      from,
      to,
      type: "contradicts",
      source: source("opstruth-rule-engine", item.rule),
      observedAt,
      basis: "observed",
      evidenceNodeIds: item.nodeIds,
    }));
  }
  return edges;
}

function ensureLimits(nodes, edges) {
  if (nodes.length > GRAPH_LIMITS.maxNodes) throw new Error("evidence_graph_node_limit");
  if (edges.length > GRAPH_LIMITS.maxEdges) throw new Error("evidence_graph_edge_limit");
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error("evidence_graph_duplicate_node_id");
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) throw new Error("evidence_graph_duplicate_edge_id");
}

export async function buildEvidenceGraph({ repositorySnapshot, deploymentReport = null, protocolArtifacts = [], observedAt, env = {} }) {
  if (!repositorySnapshot?.repository) throw new Error("repository_snapshot_required");
  const time = isoTime(observedAt);
  const repository = repositorySnapshot.repository;
  const repositoryIdentity = repository.providerRepositoryId || null;
  const commitSha = repository.headCommitSha || repositorySnapshot.githubStatus?.headCommitSha || null;
  const nodes = [];
  const edges = [];

  const repositoryNode = await evidenceNode({
    id: nodeId("repository", "github", repositoryIdentity || repository.fullName),
    type: "repository",
    subjectRef: { provider: "github", repositoryId: repositoryIdentity, repositoryName: repository.fullName },
    source: source(repository.metadataSource || "github-public-api", repository.htmlUrl),
    observedAt: time,
    authority: authority(repository.visibility === "private" ? "brokered_read" : "public"),
    freshUntil: freshUntil(time),
    status: repositoryIdentity ? "OBSERVED" : "UNAVAILABLE",
    attributes: { defaultBranch: repository.defaultBranch, visibility: repository.visibility, archived: repository.archived, fork: repository.fork },
  });
  nodes.push(repositoryNode);

  const branchNode = await evidenceNode({
    id: nodeId("branch", repositoryIdentity || repository.fullName, repository.defaultBranch),
    type: "branch",
    subjectRef: { provider: "github", repositoryId: repositoryIdentity, branch: repository.defaultBranch },
    source: source(repositorySnapshot.githubStatus?.source || repository.metadataSource || "github-public-api"),
    observedAt: time,
    authority: authority(repository.visibility === "private" ? "brokered_read" : "public"),
    freshUntil: freshUntil(time),
    status: commitSha ? "OBSERVED" : "UNAVAILABLE",
    attributes: { name: repository.defaultBranch, headCommitSha: commitSha },
  });
  nodes.push(branchNode);
  edges.push(await evidenceEdge({
    id: edgeId("contains", repositoryNode.id, branchNode.id), from: repositoryNode.id, to: branchNode.id, type: "contains",
    source: source(repositorySnapshot.githubStatus?.source || repository.metadataSource || "github-public-api"), observedAt: time, basis: "observed", evidenceNodeIds: [repositoryNode.id, branchNode.id],
  }));

  let commitNode = null;
  if (commitSha) {
    commitNode = await evidenceNode({
      id: nodeId("commit", repositoryIdentity || repository.fullName, commitSha),
      type: "commit",
      subjectRef: { provider: "github", repositoryId: repositoryIdentity, commitSha },
      source: source(repositorySnapshot.githubStatus?.source || repository.metadataSource || "github-public-api"),
      observedAt: time,
      authority: authority(repository.visibility === "private" ? "brokered_read" : "public"),
      freshUntil: freshUntil(time),
      status: "OBSERVED",
      attributes: { sha: commitSha, role: "observed_head", branch: repository.defaultBranch },
    });
    nodes.push(commitNode);
    edges.push(await evidenceEdge({
      id: edgeId("contains", branchNode.id, commitNode.id), from: branchNode.id, to: commitNode.id, type: "contains",
      source: source("github-public-api"), observedAt: time, basis: "observed", evidenceNodeIds: [branchNode.id, commitNode.id],
    }));
  }

  const runs = repositorySnapshot.githubStatus?.workflowRuns?.latest || [];
  for (const [index, run] of runs.slice(0, 20).entries()) {
    const ciNode = await evidenceNode({
      id: nodeId("ci_run", repositoryIdentity || repository.fullName, run.id),
      type: "ci_run",
      subjectRef: { provider: "github", repositoryId: repositoryIdentity, runId: String(run.id), headCommitSha: run.headSha || null },
      source: source("github-public-api", run.htmlUrl || null),
      observedAt: time,
      authority: authority(repository.visibility === "private" ? "brokered_read" : "public"),
      freshUntil: freshUntil(time),
      status: run.status === "completed" ? "OBSERVED" : "CLAIMED",
      attributes: {
        name: run.name, status: run.status, conclusion: run.conclusion, headCommitSha: run.headSha,
        currentRelease: index === 0, runNumber: run.runNumber, startedAt: run.startedAt, updatedAt: run.updatedAt,
      },
    });
    nodes.push(ciNode);
    if (commitNode && run.headSha === commitSha) {
      edges.push(await evidenceEdge({
        id: edgeId("tested_by", commitNode.id, ciNode.id), from: commitNode.id, to: ciNode.id, type: "tested_by",
        source: source("github-public-api"), observedAt: time, basis: "observed", evidenceNodeIds: [commitNode.id, ciNode.id],
      }));
    }
  }

  if (deploymentReport) {
    for (const probe of deploymentReport.probes || []) {
      const url = new URL(probe.requestedUrl);
      nodes.push(await evidenceNode({
        id: nodeId("runtime_observation", url.origin, url.pathname, time),
        type: "runtime_observation",
        subjectRef: { origin: url.origin, path: url.pathname, environment: deploymentReport.target?.environment || null },
        source: source("bounded-https-probe", probe.finalUrl || probe.requestedUrl),
        observedAt: time,
        authority: authority("public"),
        freshUntil: freshUntil(time),
        status: probe.ok ? "OBSERVED" : "UNAVAILABLE",
        attributes: { path: url.pathname, method: probe.method, status: probe.status, ok: probe.ok, deploymentRef: deploymentReport.target?.deploymentId || null },
      }));
    }
  }

  for (const artifact of protocolArtifacts.slice(0, 10)) {
    const type = ({
      "opstruth.action-request": "action_request",
      "opstruth.action-authorization": "action_authorization",
      "opstruth.execution-receipt": "execution_receipt",
      "opstruth.verification-result": "verification_result",
    })[artifact?.schema];
    if (!type) continue;
    const artifactVerification = await verifyProtocolArtifact(artifact, { now: time, trustedSignerFingerprints: [] });
    const cryptographicallyValid = artifactVerification.digestValid && (artifactVerification.signatureValid !== false);
    nodes.push(await evidenceNode({
      id: nodeId(type, artifact.requestId || artifact.authorizationId || artifact.receiptId || artifact.resultId || artifact.digest),
      type,
      subjectRef: artifact.subject || { requestDigest: artifact.requestDigest || artifact.digest },
      source: source("caller-supplied-protocol-artifact"),
      observedAt: time,
      authority: authority("caller_supplied"),
      freshUntil: artifact.expiresAt || null,
      status: cryptographicallyValid ? "CLAIMED" : "INVALID",
      attributes: {
        digest: artifact.digest, requestId: artifact.requestId || null, requestDigest: artifact.requestDigest || null,
        authorizationDigest: artifact.authorizationDigest || null, receiptDigest: artifact.receiptDigest || null,
        executionState: artifact.executionState || null,
        digestValid: artifactVerification.digestValid, signatureValid: artifactVerification.signatureValid, signerTrusted: false,
      },
    }));
  }

  const requestNode = matching(nodes, "action_request")[0];
  const authorizationNode = matching(nodes, "action_authorization")[0];
  const receiptNode = matching(nodes, "execution_receipt")[0];
  const resultNode = matching(nodes, "verification_result")[0];
  if (requestNode && authorizationNode && authorizationNode.attributes.requestDigest === requestNode.attributes.digest) {
    edges.push(await evidenceEdge({
      id: edgeId("authorizes", authorizationNode.id, requestNode.id), from: authorizationNode.id, to: requestNode.id, type: "authorizes",
      source: source("caller-supplied-protocol-artifact"), observedAt: time, basis: "observed", evidenceNodeIds: [authorizationNode.id, requestNode.id],
    }));
  }
  if (requestNode && receiptNode) {
    edges.push(await evidenceEdge({
      id: edgeId("claims", receiptNode.id, requestNode.id), from: receiptNode.id, to: requestNode.id, type: "claims",
      source: source("caller-supplied-protocol-artifact"), observedAt: time, basis: "observed", evidenceNodeIds: [receiptNode.id, requestNode.id],
    }));
  }
  if (receiptNode && resultNode && resultNode.attributes.receiptDigest === receiptNode.attributes.digest) {
    edges.push(await evidenceEdge({
      id: edgeId("verifies", resultNode.id, receiptNode.id), from: resultNode.id, to: receiptNode.id, type: "verifies",
      source: source("caller-supplied-protocol-artifact"), observedAt: time, basis: "observed", evidenceNodeIds: [resultNode.id, receiptNode.id],
    }));
  }

  const scope = graphScope(nodes);
  const scopeNode = await evidenceNode({
    id: nodeId("finding", repositoryIdentity || repository.fullName, "assessment-scope"),
    type: "finding",
    subjectRef: { provider: "github", repositoryId: repositoryIdentity, repositoryName: repository.fullName },
    source: source("opstruth-rule-engine", "assessment-scope-v1"),
    observedAt: time,
    authority: authority("public"),
    freshUntil: null,
    status: "OBSERVED",
    attributes: {
      kind: "assessment_scope",
      assessed: scope.assessed,
      notAssessed: scope.notAssessed,
      statement: "Repository identity and available exact-head CI evidence are scoped assertions; release readiness remains unproven.",
    },
  });
  nodes.push(scopeNode);
  edges.push(await evidenceEdge({
    id: edgeId("addresses", scopeNode.id, repositoryNode.id, "assessment-scope"),
    from: scopeNode.id,
    to: repositoryNode.id,
    type: "addresses",
    source: source("opstruth-rule-engine", "assessment-scope-v1"),
    observedAt: time,
    basis: "observed",
    evidenceNodeIds: [scopeNode.id, repositoryNode.id],
  }));

  const contradictions = detectContradictions(nodes);
  edges.push(...await contradictionEdges(contradictions, nodes, time));
  const assertions = [];
  assertions.push(repositoryIdentity
    ? assertion("repository.identity", "VERIFIED", "GitHub returned an immutable provider repository identifier.", [repositoryNode.id], repositoryIdentity, repositoryIdentity)
    : assertion("repository.identity", "UNPROVEN", "The repository name was observed but no immutable provider identifier was available.", [repositoryNode.id], "immutable provider repository ID", null));
  assertions.push(commitNode
    ? assertion("repository.head_commit", "VERIFIED", "The default branch head commit was observed.", [commitNode.id], "current head commit", commitSha)
    : assertion("repository.head_commit", "UNPROVEN", "The default branch head commit could not be observed.", [], "current head commit", null));
  const currentCi = matching(nodes, "ci_run").find((node) => node.attributes?.currentRelease === true);
  if (currentCi) {
    if (currentCi.attributes.headCommitSha !== commitSha) assertions.push(assertion("ci.commit_binding", "CONTRADICTED", "The latest CI run is not bound to the observed head commit.", [commitNode?.id, currentCi.id].filter(Boolean), commitSha, currentCi.attributes.headCommitSha));
    else if (currentCi.attributes.status !== "completed") assertions.push(assertion("ci.commit_binding", "UNPROVEN", "The current commit CI run has not completed.", [currentCi.id], "completed", currentCi.attributes.status));
    else if (currentCi.attributes.conclusion !== "success") assertions.push(assertion("ci.commit_binding", "CONTRADICTED", "The current commit CI run did not succeed.", [currentCi.id], "success", currentCi.attributes.conclusion));
    else assertions.push(assertion("ci.commit_binding", "VERIFIED", "The latest completed successful CI run is bound to the observed head commit.", [commitNode?.id, currentCi.id].filter(Boolean), commitSha, currentCi.attributes.headCommitSha));
  } else {
    assertions.push(assertion("ci.commit_binding", "UNPROVEN", "No current CI run was available.", [], "successful current-commit CI", null));
  }
  if (deploymentReport) {
    assertions.push(assertion(
      "deployment.commit_binding",
      "UNPROVEN",
      "The public runtime was observed, but no provider deployment identity bound it to the repository commit.",
      matching(nodes, "runtime_observation").map((node) => node.id),
      commitSha,
      null,
    ));
  }
  assertions.push(assertion(
    "release.readiness",
    "UNPROVEN",
    "Repository and observed CI evidence do not establish deployment, publication, migration, rollback, or release readiness.",
    [scopeNode.id, repositoryNode.id, commitNode?.id, currentCi?.id].filter(Boolean),
    "independently verified release readiness",
    null,
  ));
  const verdict = overallVerdict(assertions, contradictions);
  ensureLimits(nodes, edges);
  nodes.sort((left, right) => left.id.localeCompare(right.id));
  edges.sort((left, right) => left.id.localeCompare(right.id));
  const body = {
    schema: GRAPH_SCHEMA,
    schemaVersion: GRAPH_VERSION,
    createdAt: time,
    subject: { provider: "github", repositoryId: repositoryIdentity, repositoryName: repository.fullName, commitSha },
    policy: { stateless: true, independentlyVerified: true, graphLimits: GRAPH_LIMITS },
    nodes,
    edges,
    summary: {
      verdict,
      assertionResults: assertions,
      contradictions,
      counts: { nodes: nodes.length, edges: edges.length, contradictions: contradictions.length, unproven: assertions.filter((item) => item.verdict === "UNPROVEN").length },
    },
  };
  const graphIdDigest = await canonicalDigest(GRAPH_ID_DOMAIN, body);
  const signed = await signProtocolArtifact({ ...body, graphId: `urn:opstruth:evidence-graph:${graphIdDigest.slice("sha256:".length)}` }, env);
  const serializedBytes = new TextEncoder().encode(JSON.stringify(signed)).byteLength;
  if (serializedBytes > GRAPH_LIMITS.maxSnapshotBytes) throw new Error("evidence_graph_snapshot_limit");
  return signed;
}

export async function verifyEvidenceGraph(graph, options = {}) {
  const protocol = await verifyProtocolArtifact(graph, options);
  const errors = [...protocol.errors];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const checkedAt = Date.parse(options.now || new Date().toISOString());
  const staleNodeIds = nodes.filter((node) => node.freshUntil && Date.parse(node.freshUntil) <= checkedAt).map((node) => node.id).sort();
  try { ensureLimits(nodes, edges); } catch (error) { errors.push(error.message); }
  try {
    const serializedBytes = new TextEncoder().encode(JSON.stringify(graph)).byteLength;
    if (serializedBytes > GRAPH_LIMITS.maxSnapshotBytes) errors.push("evidence_graph_snapshot_limit");
  } catch {
    errors.push("evidence_graph_serialization_invalid");
  }
  for (const node of nodes) {
    if (!NODE_TYPES.has(node.type)) errors.push(`unknown_node_type:${node.type}`);
    const expected = await canonicalDigest(NODE_DOMAIN, withoutFields(node, ["digest"])).catch(() => null);
    if (!expected || expected !== node.digest) errors.push(`node_digest_mismatch:${node.id || "unknown"}`);
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!EDGE_TYPES.has(edge.type)) errors.push(`unknown_edge_type:${edge.type}`);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`edge_endpoint_missing:${edge.id || "unknown"}`);
    for (const evidenceNodeId of edge.evidenceNodeIds || []) {
      if (!nodeIds.has(evidenceNodeId)) errors.push(`edge_evidence_node_missing:${edge.id || "unknown"}:${evidenceNodeId}`);
    }
    const expected = await canonicalDigest(EDGE_DOMAIN, withoutFields(edge, ["digest"])).catch(() => null);
    if (!expected || expected !== edge.digest) errors.push(`edge_digest_mismatch:${edge.id || "unknown"}`);
  }
  const assertions = Array.isArray(graph?.summary?.assertionResults) ? graph.summary.assertionResults : [];
  for (const item of assertions) {
    for (const evidenceNodeId of item.evidenceNodeIds || []) {
      if (!nodeIds.has(evidenceNodeId)) errors.push(`assertion_evidence_node_missing:${item.assertionId || "unknown"}:${evidenceNodeId}`);
    }
  }
  const repositoryNodes = matching(nodes, "repository");
  if (repositoryNodes.length !== 1) errors.push("repository_node_cardinality_invalid");
  const repositoryNode = repositoryNodes[0];
  if (repositoryNode && (
    repositoryNode.subjectRef?.provider !== graph?.subject?.provider
    || repositoryNode.subjectRef?.repositoryId !== graph?.subject?.repositoryId
    || repositoryNode.subjectRef?.repositoryName !== graph?.subject?.repositoryName
  )) errors.push("graph_subject_repository_mismatch");
  const observedHeads = matching(nodes, "commit").filter((node) => node.attributes?.role === "observed_head");
  if (graph?.subject?.commitSha && (observedHeads.length !== 1 || observedHeads[0].attributes?.sha !== graph.subject.commitSha)) {
    errors.push("graph_subject_commit_mismatch");
  }
  let computedContradictions = [];
  try {
    computedContradictions = detectContradictions(nodes);
    if (canonicalJson(computedContradictions) !== canonicalJson(graph?.summary?.contradictions || [])) errors.push("graph_contradiction_summary_mismatch");
  } catch {
    errors.push("graph_contradiction_summary_invalid");
  }
  const counts = graph?.summary?.counts || {};
  if (counts.nodes !== nodes.length) errors.push("graph_node_count_mismatch");
  if (counts.edges !== edges.length) errors.push("graph_edge_count_mismatch");
  if (counts.contradictions !== computedContradictions.length) errors.push("graph_contradiction_count_mismatch");
  if (counts.unproven !== assertions.filter((item) => item.verdict === "UNPROVEN").length) errors.push("graph_unproven_count_mismatch");
  const scopeNodes = matching(nodes, "finding").filter((node) => node.attributes?.kind === "assessment_scope");
  const hasScopedAssessment = scopeNodes.length > 0;
  const expectedScope = graphScope(nodes);
  const releaseAssertions = assertions.filter((item) => item.assertionId === "release.readiness");
  if (hasScopedAssessment) {
    if (scopeNodes.length !== 1
      || typeof scopeNodes[0].attributes?.statement !== "string"
      || canonicalJson(scopeNodes[0].attributes?.assessed || []) !== canonicalJson(expectedScope.assessed)
      || canonicalJson(scopeNodes[0].attributes?.notAssessed || []) !== canonicalJson(expectedScope.notAssessed)) {
      errors.push("graph_scope_summary_mismatch");
    }
    if (releaseAssertions.length !== 1 || releaseAssertions[0].verdict !== "UNPROVEN") errors.push("graph_release_readiness_scope_invalid");
  } else if (releaseAssertions.length) {
    errors.push("graph_scope_summary_missing");
  }
  const expectedVerdict = overallVerdict(assertions, computedContradictions);
  if (!VERDICTS.has(graph?.summary?.verdict) || graph?.summary?.verdict !== expectedVerdict) errors.push("graph_verdict_invalid");
  try {
    const graphIdPayload = withoutFields(graph, ["graphId", "digest", "proof"]);
    const expectedGraphIdDigest = await canonicalDigest(GRAPH_ID_DOMAIN, graphIdPayload);
    const expectedGraphId = `urn:opstruth:evidence-graph:${expectedGraphIdDigest.slice("sha256:".length)}`;
    if (graph?.graphId !== expectedGraphId) errors.push("graph_id_mismatch");
  } catch {
    errors.push("graph_id_invalid");
  }
  return {
    valid: errors.length === 0,
    digestValid: protocol.digestValid,
    signatureValid: protocol.signatureValid,
    trusted: protocol.trusted,
    integrity: protocol.signatureValid ? "signed" : protocol.digestValid ? "digest_only" : "invalid",
    signerFingerprint: protocol.signerFingerprint,
    scopeIntegrity: hasScopedAssessment ? "scoped" : "legacy_unscoped",
    releaseReadiness: "UNPROVEN",
    staleNodeIds,
    errors: [...new Set(errors)],
  };
}

function semanticNodeKey(node) {
  if (node.type === "runtime_observation") {
    return canonicalJson({ type: node.type, subjectRef: node.subjectRef });
  }
  return node.id;
}

function semanticNodeValue(node) {
  return withoutFields(node, ["id", "digest", "observedAt", "freshUntil"]);
}

function semanticEdgeKey(edge, nodeKeys) {
  return canonicalJson({
    type: edge.type,
    from: nodeKeys.get(edge.from) || edge.from,
    to: nodeKeys.get(edge.to) || edge.to,
    suffix: String(edge.id || "").split(":").at(-1) || "evidence",
  });
}

function semanticEdgeValue(edge, nodeKeys) {
  return {
    ...withoutFields(edge, ["id", "digest", "observedAt", "from", "to", "evidenceNodeIds"]),
    from: nodeKeys.get(edge.from) || edge.from,
    to: nodeKeys.get(edge.to) || edge.to,
    evidenceNodeIds: (edge.evidenceNodeIds || []).map((id) => nodeKeys.get(id) || id).sort(),
  };
}

function semanticContradictionKey(item, nodeKeys) {
  return canonicalJson({
    rule: item.rule,
    nodeKeys: (item.nodeIds || []).map((id) => nodeKeys.get(id) || id).sort(),
  });
}

function mapSemantic(values, keyFor, valueFor) {
  const result = new Map();
  for (const value of values || []) {
    const key = keyFor(value);
    if (result.has(key)) throw new Error("evidence_graph_semantic_identity_collision");
    result.set(key, { id: value.id, value: valueFor(value), freshUntil: value.freshUntil });
  }
  return result;
}

function changedIds(before, after, comparedAt) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, item] of after) {
    if (!before.has(key)) added.push(item.id);
    else if (canonicalJson(before.get(key).value) !== canonicalJson(item.value)) changed.push(item.id);
  }
  for (const [key, item] of before) if (!after.has(key)) removed.push(item.id);
  const timestamp = Date.parse(comparedAt);
  const stale = [...after.values()].filter((item) => item.freshUntil && Date.parse(item.freshUntil) <= timestamp).map((item) => item.id).sort();
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort(), stale };
}

export async function compareEvidenceGraphs(before, after, options = {}) {
  const comparedAt = isoTime(options.comparedAt);
  const [beforeVerification, afterVerification] = await Promise.all([
    verifyEvidenceGraph(before, { ...options, now: comparedAt }),
    verifyEvidenceGraph(after, { ...options, now: comparedAt }),
  ]);
  if (before?.schemaVersion !== GRAPH_VERSION || after?.schemaVersion !== GRAPH_VERSION) throw new Error("evidence_graph_version_incompatible");
  if (!beforeVerification.valid) throw new Error(`evidence_graph_before_invalid:${beforeVerification.errors.join("|")}`);
  if (!afterVerification.valid) throw new Error(`evidence_graph_after_invalid:${afterVerification.errors.join("|")}`);
  if ((options.trustedSignerFingerprints || []).length && (!beforeVerification.trusted || !afterVerification.trusted)) {
    throw new Error("evidence_graph_signer_untrusted");
  }
  const beforeSubject = before?.subject || {};
  const afterSubject = after?.subject || {};
  if (!beforeSubject.repositoryId || beforeSubject.repositoryId !== afterSubject.repositoryId || beforeSubject.provider !== afterSubject.provider) {
    throw new Error("evidence_graph_subject_incompatible");
  }
  const beforeNodeKeys = new Map((before.nodes || []).map((node) => [node.id, semanticNodeKey(node)]));
  const afterNodeKeys = new Map((after.nodes || []).map((node) => [node.id, semanticNodeKey(node)]));
  const nodeChanges = changedIds(
    mapSemantic(before.nodes, semanticNodeKey, semanticNodeValue),
    mapSemantic(after.nodes, semanticNodeKey, semanticNodeValue),
    comparedAt,
  );
  const edgeChanges = changedIds(
    mapSemantic(before.edges, (edge) => semanticEdgeKey(edge, beforeNodeKeys), (edge) => semanticEdgeValue(edge, beforeNodeKeys)),
    mapSemantic(after.edges, (edge) => semanticEdgeKey(edge, afterNodeKeys), (edge) => semanticEdgeValue(edge, afterNodeKeys)),
    comparedAt,
  );
  const beforeContradictions = new Set((before.summary?.contradictions || []).map((item) => semanticContradictionKey(item, beforeNodeKeys)));
  const payload = {
    schema: "opstruth.evidence-delta",
    schemaVersion: "1.0.0",
    comparedAt,
    subject: after.subject,
    before: { graphId: before.graphId, digest: before.digest, verification: beforeVerification },
    after: { graphId: after.graphId, digest: after.digest, verification: afterVerification },
    nodeChanges,
    edgeChanges,
    verdictTransition: { from: before.summary?.verdict || "UNPROVEN", to: after.summary?.verdict || "UNPROVEN" },
    newlyContradicted: (after.summary?.contradictions || []).filter((item) => !beforeContradictions.has(semanticContradictionKey(item, afterNodeKeys))),
  };
  return { ...payload, digest: await canonicalDigest(DELTA_DOMAIN, payload) };
}
