import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { verifyExecutionOutcome } from "../src/post-execution.js";
import { signProtocolArtifact, verifyHandoffChain, verifyProtocolArtifact } from "../src/protocol.js";
import { loadRepositorySnapshot } from "../src/github.js";
import { validateAgainstSchema } from "../scripts/validate-contracts.mjs";
import { installGithubFetchMock } from "./fixtures.js";
import { protocolChain } from "./protocol-fixtures.js";

const resultSchema = JSON.parse(await readFile(new URL("../contracts/verification-result.schema.json", import.meta.url), "utf8"));

test("protocol artifacts use valid canonical digests, signatures and explicit trust", async () => {
  const chain = await protocolChain();
  const trusted = [chain.authorization.proof.signerFingerprint, chain.receipt.proof.signerFingerprint];
  const verification = await verifyHandoffChain(chain, { now: "2026-08-27T12:10:00Z", trustedSignerFingerprints: trusted });
  assert.equal(verification.valid, true);
  assert.equal(verification.authorization.signatureValid, true);
  assert.equal(verification.authorization.trusted, true);
  assert.equal(verification.receipt.signatureValid, true);
  assert.equal(verification.replayStatus, "unproven");
});

test("tampered and over-broad handoff chains fail closed", async () => {
  const chain = await protocolChain();
  const tampered = structuredClone(chain.authorization);
  tampered.grantedOperations.push("deploy");
  const artifact = await verifyProtocolArtifact(tampered, { now: "2026-08-27T12:10:00Z" });
  assert.equal(artifact.digestValid, false);
  assert.equal(artifact.signatureValid, false);
  const verification = await verifyHandoffChain({ ...chain, authorization: tampered }, { now: "2026-08-27T12:10:00Z" });
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.includes("authorization_scope_expansion:deploy"));
});

test("expired, replayed and untrusted handoffs remain distinct failures", async () => {
  const chain = await protocolChain();
  const expired = await verifyHandoffChain(chain, { now: "2026-08-29T12:10:00Z" });
  assert.equal(expired.valid, false);
  assert.ok(expired.errors.includes("request:artifact_expired"));
  assert.ok(expired.errors.includes("authorization:artifact_expired"));

  const replayed = await verifyHandoffChain(chain, {
    now: "2026-08-27T12:10:00Z",
    trustedSignerFingerprints: [chain.authorization.proof.signerFingerprint, chain.receipt.proof.signerFingerprint],
    consumedNonces: new Set([chain.authorization.nonce]),
  });
  assert.equal(replayed.replayStatus, "replayed");
  assert.equal(replayed.valid, false);
  assert.ok(replayed.errors.includes("authorization_nonce_replayed"));

  const untrusted = await verifyProtocolArtifact(chain.receipt, { now: "2026-08-27T12:10:00Z", trustedSignerFingerprints: [] });
  assert.equal(untrusted.signatureValid, true);
  assert.equal(untrusted.trusted, false);

  const future = await verifyProtocolArtifact(chain.authorization, { now: "2026-08-27T11:00:00Z" });
  assert.ok(future.errors.includes("issuedAt_in_future"));
});

test("authorizer, executor and verifier signing identities remain separate", async () => {
  const chain = await protocolChain();
  const receiptPayload = structuredClone(chain.receipt);
  delete receiptPayload.digest;
  delete receiptPayload.proof;
  const sameIdentityReceipt = await signProtocolArtifact(receiptPayload, chain.authorizerEnv);
  const handoff = await verifyHandoffChain({ ...chain, receipt: sameIdentityReceipt }, {
    now: "2026-08-27T12:10:00Z",
    trustedAuthorizerFingerprints: [chain.authorization.proof.signerFingerprint],
    trustedExecutorFingerprints: [sameIdentityReceipt.proof.signerFingerprint],
  });
  assert.equal(handoff.valid, false);
  assert.ok(handoff.errors.includes("authorizer_executor_signing_identity_not_separate"));

  const restore = installGithubFetchMock();
  try {
    const snapshot = await loadRepositorySnapshot("Example/project", {}, {});
    const outcome = await verifyExecutionOutcome({
      ...chain,
      repositorySnapshot: snapshot,
      trustedAuthorizerFingerprints: [chain.authorization.proof.signerFingerprint],
      trustedExecutorFingerprints: [chain.receipt.proof.signerFingerprint],
      observedAt: "2026-08-27T12:10:00Z",
      env: chain.authorizerEnv,
    });
    assert.equal(outcome.result.verdict, "CONTRADICTED");
    assert.ok(outcome.result.errors.includes("verifier_authorizer_signing_identity_not_separate"));
  } finally {
    restore();
  }
});

test("post-execution verification ignores executor success and uses fresh bound evidence", async () => {
  const restore = installGithubFetchMock();
  try {
    const chain = await protocolChain();
    const snapshot = await loadRepositorySnapshot("Example/project", {}, {});
    const trusted = [chain.authorization.proof.signerFingerprint, chain.receipt.proof.signerFingerprint];
    const verified = await verifyExecutionOutcome({
      ...chain,
      repositorySnapshot: snapshot,
      trustedSignerFingerprints: trusted,
      observedAt: "2026-08-27T12:10:00Z",
      env: chain.verifierEnv,
    });
    assert.equal(verified.result.verdict, "VERIFIED");
    assert.equal(verified.result.assertionResults[0].verdict, "VERIFIED");
    assert.notEqual(verified.result.proof.signerFingerprint, chain.receipt.proof.signerFingerprint);
    assert.deepEqual(validateAgainstSchema(verified.result, resultSchema), []);

    const forged = structuredClone(chain.receipt);
    forged.executionState = "FAILED";
    const rejected = await verifyExecutionOutcome({
      request: chain.request,
      authorization: chain.authorization,
      receipt: forged,
      repositorySnapshot: snapshot,
      trustedSignerFingerprints: trusted,
      observedAt: "2026-08-27T12:10:00Z",
      env: chain.verifierEnv,
    });
    assert.notEqual(rejected.result.verdict, "VERIFIED");
    assert.ok(rejected.result.errors.some((error) => /receipt:.*mismatch|receipt:signature_invalid/.test(error)));
  } finally {
    restore();
  }
});

test("post-execution verification rejects a different repository subject", async () => {
  const restore = installGithubFetchMock();
  try {
    const chain = await protocolChain();
    chain.request.subject.repositoryId = "999999";
    chain.request.digest = await (await import("../src/protocol.js")).computeArtifactDigest(chain.request);
    const snapshot = await loadRepositorySnapshot("Example/project", {}, {});
    const outcome = await verifyExecutionOutcome({
      ...chain,
      repositorySnapshot: snapshot,
      trustedSignerFingerprints: [chain.authorization.proof.signerFingerprint, chain.receipt.proof.signerFingerprint],
      observedAt: "2026-08-27T12:10:00Z",
      env: chain.verifierEnv,
    });
    assert.notEqual(outcome.result.verdict, "VERIFIED");
    assert.ok(outcome.result.errors.includes("subject_repository_mismatch"));
  } finally {
    restore();
  }
});
