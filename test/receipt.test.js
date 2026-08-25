import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifyAgentProofReceipt } from "../src/receipt.js";
import { stableJson } from "../src/utils.js";

function fixtureReceipt() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const der = publicKey.export({ type: "spki", format: "der" });
  const signerFingerprint = `sha256:${createHash("sha256").update(der).digest("hex")}`;
  const payload = {
    schemaId: "agentproof.signed-receipt.v2",
    schemaVersion: "2.0.0",
    receiptFormatVersion: "v2",
    actionType: "agentproof.repository_patch.v1",
    receiptId: "receipt-test",
    transactionId: "transaction-test",
    authorityEnvironment: "development",
    executionState: "executed",
    verificationState: "verified",
  };
  const canonical = `agentproof.signed-receipt.v2\0${stableJson(payload)}`;
  const payloadDigest = createHash("sha256").update(canonical).digest("hex");
  return {
    document: {
      payload,
      proof: {
        algorithm: "Ed25519",
        keyId: "test",
        publicKeyPem,
        signerFingerprint,
        payloadDigest,
        signatureBase64: sign(null, Buffer.from(canonical), privateKey).toString("base64"),
      },
    },
    signerFingerprint,
  };
}

test("AgentProof receipt verification separates validity from trust", async () => {
  const { document, signerFingerprint } = fixtureReceipt();
  const untrusted = await verifyAgentProofReceipt(document, []);
  assert.equal(untrusted.cryptographicallyValid, true);
  assert.equal(untrusted.trusted, false);
  const trusted = await verifyAgentProofReceipt(document, [signerFingerprint]);
  assert.equal(trusted.cryptographicallyValid, true);
  assert.equal(trusted.trusted, true);
});

test("AgentProof receipt verifier rejects digest drift", async () => {
  const { document } = fixtureReceipt();
  document.payload.receiptId = "tampered";
  const result = await verifyAgentProofReceipt(document, []);
  assert.equal(result.cryptographicallyValid, false);
  assert.equal(result.reason, "digest_mismatch");
});
