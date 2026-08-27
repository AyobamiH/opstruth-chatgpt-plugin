import { generateKeyPairSync } from "node:crypto";
import { computeArtifactDigest, constraintsDigest, signProtocolArtifact } from "../src/protocol.js";

export function testSigningEnv() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export async function protocolChain() {
  const authorizerEnv = testSigningEnv();
  const executorEnv = testSigningEnv();
  const verifierEnv = testSigningEnv();
  const constraints = {
    allowedPaths: ["src/**", "test/**"],
    deniedPaths: [".github/**"],
    allowedEnvironments: ["production"],
    networkPolicy: "dependency_acquisition_only",
    maxDurationSeconds: 1800,
    maxOperations: 20,
  };
  const requestBase = {
    schema: "opstruth.action-request",
    schemaVersion: "1.0.0",
    requestId: "urn:uuid:11111111-1111-4111-8111-111111111111",
    createdAt: "2026-08-27T12:00:00Z",
    expiresAt: "2026-08-28T13:00:00Z",
    issuer: { id: "urn:opstruth:service:public-verifier", type: "service" },
    subject: {
      provider: "github",
      repositoryId: "424242",
      repositoryName: "Example/project",
      baselineCommitSha: "1111111111111111111111111111111111111111",
      environment: "production",
    },
    findingRefs: [{ id: "urn:opstruth:finding:ci-binding", digest: `sha256:${"1".repeat(64)}` }],
    requestedOutcome: {
      description: "Prove that successful CI is bound to the expected repository commit.",
      assertions: [{
        assertionId: "ci.current_commit.success",
        description: "The current CI run is bound to the expected commit.",
        target: { nodeType: "ci_run", field: "headCommitSha", match: { current: true } },
        predicate: "equals",
        expected: "1111111111111111111111111111111111111111",
        evidenceRequirements: ["commit", "ci_run"],
      }],
    },
    permittedOperations: ["run_declared_checks"],
    forbiddenOperations: ["deploy", "rotate_secret"],
    constraints,
    approvalRequirement: {
      required: true,
      minimumApprovals: 1,
      allowedApproverIds: ["urn:opstruth:human:repository-owner"],
    },
    idempotencyKey: "request.11111111-1111-4111-8111-111111111111",
  };
  const request = { ...requestBase, digest: await computeArtifactDigest(requestBase) };
  const authorization = await signProtocolArtifact({
    schema: "opstruth.action-authorization",
    schemaVersion: "1.0.0",
    authorizationId: "urn:uuid:22222222-2222-4222-8222-222222222222",
    requestDigest: request.digest,
    decision: "APPROVED",
    issuedAt: "2026-08-27T12:01:00Z",
    expiresAt: "2026-08-28T12:30:00Z",
    nonce: "nonce.22222222-2222-4222-8222-222222222222",
    approver: { id: "urn:opstruth:human:repository-owner", type: "human" },
    grantedOperations: ["run_declared_checks"],
    constraintsDigest: await constraintsDigest(constraints),
  }, authorizerEnv);
  const receipt = await signProtocolArtifact({
    schema: "opstruth.execution-receipt",
    schemaVersion: "1.0.0",
    receiptId: "urn:uuid:33333333-3333-4333-8333-333333333333",
    requestDigest: request.digest,
    authorizationDigest: authorization.digest,
    idempotencyKey: request.idempotencyKey,
    consumedAuthorizationNonce: authorization.nonce,
    executor: { id: "urn:opstruth:runner:isolated-test", type: "runner" },
    startedAt: "2026-08-27T12:02:00Z",
    completedAt: "2026-08-27T12:04:00Z",
    executionState: "SUCCEEDED",
    operations: [{
      operationId: "operation.1",
      sequence: 1,
      type: "run_declared_checks",
      target: "urn:github:repository:424242",
      state: "SUCCEEDED",
      beforeDigest: null,
      afterDigest: null,
      evidenceRefs: [],
    }],
    affectedResources: [{ id: "urn:github:commit:1111111111111111111111111111111111111111", type: "commit", digest: null }],
    artifacts: [],
    claims: [{ assertionId: "ci.current_commit.success", outcome: "SATISFIED", observedValue: true, evidenceRefs: [] }],
    changedState: false,
    errors: [],
    warnings: [],
  }, executorEnv);
  return { request, authorization, receipt, authorizerEnv, executorEnv, verifierEnv };
}
