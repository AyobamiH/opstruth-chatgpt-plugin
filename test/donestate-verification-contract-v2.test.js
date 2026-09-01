import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalJson } from "../src/canonical.js";
import { validateAgainstSchema } from "../scripts/validate-contracts.mjs";

const root = new URL("../contracts/donestate/", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const readBytes = async (path) => readFile(new URL(path, root));

function gitBlobSha(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function responseErrors(response, responseSchema, reportSchema, attestationSchema) {
  const errors = [];
  const allowed = new Set(Object.keys(responseSchema.properties));
  for (const field of responseSchema.required) {
    if (!Object.hasOwn(response, field)) errors.push(`$.${field}: required property missing`);
  }
  for (const field of Object.keys(response)) {
    if (!allowed.has(field)) errors.push(`$.${field}: unknown property`);
  }
  if (response.contractVersion !== responseSchema.properties.contractVersion.const) {
    errors.push("$.contractVersion: const mismatch");
  }
  if (response.report) errors.push(...validateAgainstSchema(response.report, reportSchema, reportSchema, "$.report"));
  if (response.attestation) errors.push(...validateAgainstSchema(response.attestation, attestationSchema, attestationSchema, "$.attestation"));
  return errors;
}

async function verifyVector(vector, expectedDecision, schemas) {
  assert.equal(vector.schemaVersion, "2.0.0");
  assert.equal(vector.response.contractVersion, "donestate.verification-contract.v2");
  assert.equal(vector.response.report.decision, expectedDecision);
  assert.equal(vector.response.attestation.decision, expectedDecision);
  assert.deepEqual(responseErrors(vector.response, ...schemas), []);

  const handoff = { ...vector.handoff };
  delete handoff.handoffDigest;
  assert.equal(
    vector.handoff.handoffDigest,
    sha256(`donestate.verification-handoff.v2\0${canonicalJson(handoff)}`),
  );
  assert.equal(vector.response.report.runId, vector.handoff.runId);
  assert.equal(vector.response.report.handoffDigest, vector.handoff.handoffDigest);
  assert.equal(vector.response.report.verificationNonce, vector.handoff.verificationNonce);
  assert.equal(vector.response.attestation.runId, vector.handoff.runId);
  assert.equal(vector.response.attestation.handoffDigest, vector.handoff.handoffDigest);
  assert.equal(vector.response.attestation.verificationNonce, vector.handoff.verificationNonce);
  assert.equal(
    vector.response.attestation.verificationReportDigest,
    sha256(`opstruth.donestate-verification-report.v1\0${canonicalJson(vector.response.report)}`),
  );

  const { signature, ...unsigned } = vector.response.attestation;
  const publicKey = createPublicKey(signature.publicKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  assert.equal(signature.signerFingerprint, sha256(der));
  assert.equal(
    verify(
      null,
      Buffer.from(`donestate.verification-attestation.v2\0${canonicalJson(unsigned)}`),
      publicKey,
      Buffer.from(signature.signatureBase64, "base64"),
    ),
    true,
  );
}

test("OpsTruth consumes the byte-identical DoneState verification contract v2 corpus", async () => {
  const manifest = await readJson("manifest.json");
  assert.equal(manifest.sourceCommit, "9e33a7e4c8505eabd24df775e8292bfaa2906f43");
  for (const [path, expectedBlob] of Object.entries(manifest.artifacts)) {
    assert.equal(gitBlobSha(await readBytes(path)), expectedBlob, `${path} drifted from DoneState`);
  }

  const responseSchema = await readJson("verification-response-v2.schema.json");
  const reportSchema = await readJson("verification-report-v1.schema.json");
  const attestationSchema = await readJson("verification-attestation-v2.schema.json");
  const schemas = [responseSchema, reportSchema, attestationSchema];
  await verifyVector(await readJson("vectors/verification-contract-v2-verified.json"), "verified", schemas);
  await verifyVector(await readJson("vectors/verification-contract-v2-failed.json"), "failed", schemas);
  await verifyVector(await readJson("vectors/verification-contract-v2-uncertain.json"), "uncertain", schemas);
});

test("OpsTruth consumes the complete DoneState negative mutation catalogue and rejects strict-envelope drift", async () => {
  const responseSchema = await readJson("verification-response-v2.schema.json");
  const reportSchema = await readJson("verification-report-v1.schema.json");
  const attestationSchema = await readJson("verification-attestation-v2.schema.json");
  const schemas = [responseSchema, reportSchema, attestationSchema];
  const negative = await readJson("vectors/verification-contract-v2-negative.json");
  const ids = negative.mutations.map((mutation) => mutation.id).sort();
  assert.deepEqual(ids, [
    "altered_handoff",
    "decision_mismatch",
    "extra_attestation_field",
    "extra_response_field",
    "extra_signature_field",
    "future_observation",
    "missing_requirement",
    "replayed_nonce",
    "revoked_signer",
    "stale_observation",
    "unsupported_contract",
  ]);

  const verified = await readJson("vectors/verification-contract-v2-verified.json");
  for (const id of ["unsupported_contract", "extra_response_field", "extra_attestation_field", "extra_signature_field"]) {
    const mutation = negative.mutations.find((item) => item.id === id);
    const response = structuredClone(verified.response);
    if (id === "unsupported_contract") response.contractVersion = mutation.value;
    if (id === "extra_response_field") response.unsupported = mutation.value;
    if (id === "extra_attestation_field") response.attestation.unsupported = mutation.value;
    if (id === "extra_signature_field") response.attestation.signature.unsupported = mutation.value;
    assert.notDeepEqual(responseErrors(response, ...schemas), [], `${id} must fail closed`);
  }
});
