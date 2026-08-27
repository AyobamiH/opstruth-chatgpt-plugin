import { canonicalDigest } from "./canonical.js";
import { buildEvidenceGraph } from "./evidence-graph.js";
import { signProtocolArtifact, verifyHandoffChain } from "./protocol.js";

const RESULT_ID_DOMAIN = "opstruth.verification-result-id.v1\0";

function matchesTarget(node, target) {
  if (node.type !== target.nodeType) return false;
  const match = target.match || {};
  if (match.path !== undefined && node.attributes?.path !== match.path) return false;
  if (match.environment !== undefined && node.attributes?.environment !== match.environment && node.subjectRef?.environment !== match.environment) return false;
  if (match.id !== undefined && node.id !== match.id && node.attributes?.id !== match.id) return false;
  if (match.current !== undefined && node.attributes?.currentRelease !== match.current) return false;
  return true;
}

function observedValue(node, field) {
  if (field === "exists") return Boolean(node);
  return node?.attributes?.[field] ?? node?.subjectRef?.[field] ?? null;
}

function predicateSatisfied(predicate, expected, observed, candidateExists) {
  if (predicate === "exists") return candidateExists;
  if (predicate === "absent") return !candidateExists;
  if (predicate === "status_in") return Array.isArray(expected) && expected.includes(observed);
  if (predicate === "reachable") return observed === true;
  if (predicate === "matches_digest" || predicate === "equals") return JSON.stringify(observed) === JSON.stringify(expected);
  return false;
}

function evaluateAssertion(assertion, graph) {
  const candidates = graph.nodes.filter((node) => matchesTarget(node, assertion.target));
  if (candidates.length > 1) {
    return {
      assertionId: assertion.assertionId,
      verdict: "UNPROVEN",
      expected: assertion.expected,
      observed: null,
      evidenceNodeIds: candidates.map((node) => node.id),
      explanation: "The machine-readable assertion target matched more than one evidence node.",
    };
  }
  const candidate = candidates[0] || null;
  const observed = observedValue(candidate, assertion.target.field);
  const candidateIds = candidates.map((node) => node.id);
  const contradicted = graph.summary.contradictions.some((item) => item.nodeIds.some((id) => candidateIds.includes(id)));
  if (contradicted) {
    return {
      assertionId: assertion.assertionId,
      verdict: "CONTRADICTED",
      expected: assertion.expected,
      observed,
      evidenceNodeIds: candidateIds,
      explanation: "Fresh evidence conflicts with another subject-bound observation.",
    };
  }
  const availableTypes = new Set(graph.nodes.filter((node) => node.status === "OBSERVED").map((node) => node.type));
  const missingRequirements = assertion.evidenceRequirements.filter((type) => !availableTypes.has(type));
  if (missingRequirements.length) {
    return {
      assertionId: assertion.assertionId,
      verdict: "UNPROVEN",
      expected: assertion.expected,
      observed,
      evidenceNodeIds: candidateIds,
      explanation: `Required fresh evidence is unavailable: ${missingRequirements.join(", ")}.`,
    };
  }
  if (!candidate && assertion.predicate !== "absent") {
    return {
      assertionId: assertion.assertionId,
      verdict: "UNPROVEN",
      expected: assertion.expected,
      observed: null,
      evidenceNodeIds: [],
      explanation: "No fresh evidence node matches the machine-readable assertion target.",
    };
  }
  if (candidate && candidate.status !== "OBSERVED") {
    return {
      assertionId: assertion.assertionId,
      verdict: "UNPROVEN",
      expected: assertion.expected,
      observed,
      evidenceNodeIds: candidateIds,
      explanation: "The matching evidence node is not an independently observed current fact.",
    };
  }
  const satisfied = predicateSatisfied(assertion.predicate, assertion.expected, observed, Boolean(candidate));
  return {
    assertionId: assertion.assertionId,
    verdict: satisfied ? "VERIFIED" : "CONTRADICTED",
    expected: assertion.expected,
    observed,
    evidenceNodeIds: candidateIds,
    explanation: satisfied ? "Fresh subject-bound evidence satisfies the assertion." : "Fresh subject-bound evidence does not satisfy the assertion.",
  };
}

function aggregateVerdict(results) {
  if (results.some((result) => result.verdict === "CONTRADICTED")) return "CONTRADICTED";
  if (results.length && results.every((result) => result.verdict === "VERIFIED")) return "VERIFIED";
  if (results.some((result) => result.verdict === "VERIFIED")) return "PARTIAL";
  return "UNPROVEN";
}

function chainFailureVerdict(errors) {
  return errors.some((error) => /mismatch|scope_expansion|not_authorized|signature_invalid|digest_mismatch/.test(error)) ? "CONTRADICTED" : "UNPROVEN";
}

export async function verifyExecutionOutcome({
  request,
  authorization,
  receipt,
  repositorySnapshot,
  deploymentReport = null,
  trustedAuthorizerFingerprints = [],
  trustedExecutorFingerprints = [],
  trustedSignerFingerprints = [],
  observedAt,
  env = {},
}) {
  const time = new Date(observedAt || Date.now()).toISOString();
  const chain = await verifyHandoffChain(
    { request, authorization, receipt },
    {
      now: time,
      trustedAuthorizerFingerprints: trustedAuthorizerFingerprints.length ? trustedAuthorizerFingerprints : trustedSignerFingerprints,
      trustedExecutorFingerprints: trustedExecutorFingerprints.length ? trustedExecutorFingerprints : trustedSignerFingerprints,
    },
  );
  const graph = await buildEvidenceGraph({
    repositorySnapshot,
    deploymentReport,
    protocolArtifacts: [request, authorization, receipt],
    observedAt: time,
    env,
  });
  let assertionResults = (request?.requestedOutcome?.assertions || []).map((item) => evaluateAssertion(item, graph));
  const trustErrors = [];
  if (!chain.authorization.trusted) trustErrors.push("authorization_signer_untrusted");
  if (!chain.receipt.trusted) trustErrors.push("executor_signer_untrusted");
  const observedRepositoryId = repositorySnapshot.repository.providerRepositoryId || null;
  if (!observedRepositoryId || observedRepositoryId !== request?.subject?.repositoryId) trustErrors.push("subject_repository_mismatch");
  const chainErrors = [...chain.errors, ...trustErrors];
  if (chainErrors.length) {
    const verdict = chainFailureVerdict(chainErrors);
    assertionResults = assertionResults.map((item) => ({
      ...item,
      verdict,
      explanation: `${item.explanation} The execution handoff chain failed independent validation.`,
    }));
  }
  let verdict = aggregateVerdict(assertionResults);
  const notVerified = assertionResults.filter((item) => item.verdict === "UNPROVEN").map((item) => item.explanation);
  const warnings = [];
  if (chain.replayStatus === "unproven") warnings.push("Global authorization nonce reuse is unproven because OpsTruth is stateless.");
  if (receipt?.executionState === "SUCCEEDED") warnings.push("Executor success was treated as a claim and did not determine the verification verdict.");
  if (!graph.proof) notVerified.push("The evidence graph is not signed by a configured OpsTruth verifier.");
  const verifierFingerprint = graph.proof?.signerFingerprint || null;
  if (verifierFingerprint && verifierFingerprint === receipt?.proof?.signerFingerprint) {
    verdict = "CONTRADICTED";
    chainErrors.push("verifier_executor_signing_identity_not_separate");
  }
  if (verifierFingerprint && verifierFingerprint === authorization?.proof?.signerFingerprint) {
    verdict = "CONTRADICTED";
    chainErrors.push("verifier_authorizer_signing_identity_not_separate");
  }
  if (!assertionResults.length) {
    verdict = "UNPROVEN";
    notVerified.push("The ActionRequest contains no independently verifiable assertions.");
  }
  const repository = repositorySnapshot.repository;
  const seed = {
    requestDigest: request?.digest,
    authorizationDigest: authorization?.digest,
    receiptDigest: receipt?.digest,
    evidenceGraphDigest: graph.digest,
    observedAt: time,
  };
  const resultId = `urn:opstruth:verification-result:${(await canonicalDigest(RESULT_ID_DOMAIN, seed)).slice("sha256:".length)}`;
  const result = await signProtocolArtifact({
    schema: "opstruth.verification-result",
    schemaVersion: "1.0.0",
    resultId,
    requestDigest: request?.digest,
    authorizationDigest: authorization?.digest,
    receiptDigest: receipt?.digest,
    evidenceGraphDigest: graph.digest,
    observedAt: time,
    verifier: { id: "urn:opstruth:service:public-verifier", type: "verifier" },
    subject: {
      provider: "github",
      repositoryId: repository.providerRepositoryId || "unavailable",
      repositoryName: repository.fullName,
      baselineCommitSha: request?.subject?.baselineCommitSha,
      observedCommitSha: repository.headCommitSha || null,
      ...(request?.subject?.environment ? { environment: request.subject.environment } : {}),
    },
    verdict,
    assertionResults,
    notVerified: [...new Set(notVerified)],
    errors: [...new Set(chainErrors)],
    warnings: [...new Set(warnings)],
  }, env);
  if (!result.proof) throw new Error("verifier_signing_required");
  return { result, evidenceGraph: graph, handoffVerification: chain };
}
