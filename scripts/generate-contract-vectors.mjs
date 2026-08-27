import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { computeArtifactDigest, constraintsDigest, signProtocolArtifact, verifyHandoffChain, verifyProtocolArtifact } from "../src/protocol.js";

const root = new URL("..", import.meta.url);

function pem(label, der) {
  const body = der.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

function deterministicEnv(fill) {
  const seed = Buffer.alloc(32, fill);
  const privateDer = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  return {
    OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8: pem("PRIVATE KEY", privateDer),
    OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI: pem("PUBLIC KEY", publicKey.export({ format: "der", type: "spki" })),
  };
}

async function example(name) {
  return JSON.parse(await readFile(new URL(`../contracts/examples/${name}.json`, import.meta.url), "utf8"));
}

async function vectors() {
  const requestExample = await example("action-request");
  const requestPayload = { ...requestExample };
  delete requestPayload.digest;
  const request = { ...requestPayload, digest: await computeArtifactDigest(requestPayload) };

  const authorizationExample = await example("action-authorization");
  const authorizationPayload = {
    ...authorizationExample,
    requestDigest: request.digest,
    constraintsDigest: await constraintsDigest(request.constraints),
  };
  delete authorizationPayload.digest;
  delete authorizationPayload.proof;
  const authorization = await signProtocolArtifact(authorizationPayload, deterministicEnv(0x11));

  const receiptExample = await example("execution-receipt");
  const receiptPayload = {
    ...receiptExample,
    requestDigest: request.digest,
    authorizationDigest: authorization.digest,
    idempotencyKey: request.idempotencyKey,
    consumedAuthorizationNonce: authorization.nonce,
  };
  delete receiptPayload.digest;
  delete receiptPayload.proof;
  const receipt = await signProtocolArtifact(receiptPayload, deterministicEnv(0x22));

  const resultExample = await example("verification-result");
  const resultPayload = {
    ...resultExample,
    requestDigest: request.digest,
    authorizationDigest: authorization.digest,
    receiptDigest: receipt.digest,
  };
  delete resultPayload.digest;
  delete resultPayload.proof;
  const result = await signProtocolArtifact(resultPayload, deterministicEnv(0x33));

  return {
    schemaVersion: "1.0.0",
    warning: "Public deterministic test vectors only. The fixed test keys carry no authority and must never be trusted in production.",
    artifacts: { request, authorization, receipt, result },
  };
}

const generated = await vectors();
if (process.argv.includes("--check")) {
  const expected = JSON.parse(await readFile(new URL("../contracts/vectors/protocol-v1.json", import.meta.url), "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(generated)) throw new Error("contract_vectors_drift");
  const chain = await verifyHandoffChain(generated.artifacts, {
    now: "2026-08-27T12:15:00Z",
    trustedAuthorizerFingerprints: [generated.artifacts.authorization.proof.signerFingerprint],
    trustedExecutorFingerprints: [generated.artifacts.receipt.proof.signerFingerprint],
  });
  if (!chain.valid) throw new Error(`contract_vector_chain_invalid:${chain.errors.join("|")}`);
  const result = await verifyProtocolArtifact(generated.artifacts.result, { now: "2026-08-27T12:15:00Z", trustedSignerFingerprints: [generated.artifacts.result.proof.signerFingerprint] });
  if (!result.digestValid || !result.signatureValid || !result.trusted) throw new Error(`verification_result_vector_invalid:${result.errors.join("|")}`);
  console.log("cryptographic contract vectors passed: 4 artifacts, 3 independent signing identities");
} else {
  console.log(JSON.stringify(generated, null, 2));
}
