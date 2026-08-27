import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const vectors = JSON.parse(await readFile(new URL("../contracts/vectors/protocol-v1.json", import.meta.url), "utf8"));
const domains = {
  "opstruth.action-request": "opstruth.action-request.v1\0",
  "opstruth.action-authorization": "opstruth.action-authorization.v1\0",
  "opstruth.execution-receipt": "opstruth.execution-receipt.v1\0",
  "opstruth.verification-result": "opstruth.verification-result.v1\0",
};

function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non_json_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function payload(document) {
  const value = { ...document };
  delete value.digest;
  delete value.proof;
  return value;
}

function bytes(document) {
  const domain = domains[document.schema];
  if (!domain || document.schemaVersion !== "1.0.0") throw new Error("unsupported_vector_schema");
  return Buffer.from(`${domain}${canonical(payload(document))}`);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

for (const [name, document] of Object.entries(vectors.artifacts)) {
  if (digest(bytes(document)) !== document.digest) throw new Error(`${name}:digest_mismatch`);
  if (document.proof) {
    const publicKey = createPublicKey(document.proof.publicKeyPem);
    const der = publicKey.export({ type: "spki", format: "der" });
    if (digest(der) !== document.proof.signerFingerprint) throw new Error(`${name}:fingerprint_mismatch`);
    if (!verify(null, bytes(document), publicKey, Buffer.from(document.proof.signatureBase64, "base64"))) throw new Error(`${name}:signature_invalid`);
  }
}

const { request, authorization, receipt, result } = vectors.artifacts;
if (authorization.requestDigest !== request.digest || receipt.requestDigest !== request.digest || receipt.authorizationDigest !== authorization.digest) throw new Error("handoff_binding_invalid");
if (result.requestDigest !== request.digest || result.authorizationDigest !== authorization.digest || result.receiptDigest !== receipt.digest) throw new Error("verification_binding_invalid");
const fingerprints = [authorization, receipt, result].map((item) => item.proof.signerFingerprint);
if (new Set(fingerprints).size !== fingerprints.length) throw new Error("signing_identities_not_separate");

console.log("standalone vector verifier passed: canonical digests, signatures, bindings and identity separation");

