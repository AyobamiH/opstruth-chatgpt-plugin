import { sha256, stableJson } from "../../src/utils.js";

export const RELEASE_VERIFICATION_SUBJECT = "opstruth.release-v1.subject.v1";
export const RELEASE_PROVENANCE_DOMAIN = "opstruth.release-v1.provenance\0";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const MAX_PROVENANCE_BYTES = 256 * 1024;
const MAX_AGE_MS = 15 * 60_000;
const bytes = new TextEncoder();

function demand(condition, code) { if (!condition) throw new Error("release_verification:" + code); }
function exact(value, keys, label) {
  demand(value && typeof value === "object" && !Array.isArray(value), label + "_shape");
  demand(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), label + "_keys");
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function checkSubject(value) {
  exact(value, ["schema", "owner", "repository", "ownerId", "repositoryId", "releaseId",
    "tagName", "tagCommit", "packageAssetId", "packageAssetName", "packageDigest",
    "provenanceAssetId", "provenanceDigest"], "subject");
  demand(value.schema === RELEASE_VERIFICATION_SUBJECT &&
    /^[A-Za-z0-9-]{1,39}$/.test(value.owner) &&
    /^[A-Za-z0-9._-]{1,100}$/.test(value.repository) &&
    /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(value.tagName) && COMMIT.test(value.tagCommit), "subject_identity");
  for (const k of ["ownerId", "repositoryId", "releaseId", "packageAssetId", "provenanceAssetId"])
    demand(positive(value[k]), "subject_numeric_ids");
  demand(value.packageAssetId !== value.provenanceAssetId && DIGEST.test(value.packageDigest) &&
    DIGEST.test(value.provenanceDigest) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.packageAssetName),
    "subject_assets");
}
const metadataFields = ["owner", "repository", "ownerId", "repositoryId", "releaseId", "tagName",
  "tagCommit", "prerelease", "draft", "publishedAt", "packageAssetId", "packageAssetName",
  "packageDigest", "provenanceAssetId", "provenanceDigest", "assetCount"];
function checkMetadata(value, subject) {
  exact(value, metadataFields, "metadata");
  for (const k of ["owner", "repository", "ownerId", "repositoryId", "releaseId", "tagName",
    "tagCommit", "packageAssetId", "packageAssetName", "packageDigest", "provenanceAssetId", "provenanceDigest"])
    demand(value[k] === subject[k], "metadata_subject_mismatch");
  demand(value.prerelease === true && value.draft === false && value.assetCount === 2 &&
    typeof value.publishedAt === "string" && Number.isFinite(Date.parse(value.publishedAt)), "release_not_published");
}
function checkBytes(value, max, label) {
  demand(value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= max,
    label + "_bytes_unavailable");
}
function derFromPem(value) {
  demand(typeof value === "string" && /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/\n=]+\n-----END PUBLIC KEY-----\n?$/.test(value), "provenance_public_key");
  const base64 = value.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
  demand(/^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length < 2048, "provenance_key_base64");
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
function decodeSignature(value) {
  demand(typeof value === "string" && /^[A-Za-z0-9+/]{86}==$/.test(value), "provenance_signature_format");
  const result = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  demand(result.length === 64 && btoa(String.fromCharCode(...result)) === value, "provenance_signature_canonical");
  return result;
}
async function checkProvenance(value, subject, packageSha, trustedFingerprints, observedAt) {
  exact(value, ["schema", "subjectDigest", "packageSha256", "issuer", "issuedAt", "signature"], "provenance");
  exact(value.signature, ["algorithm", "publicKeyPem", "signerFingerprint", "signatureBase64"], "provenance_signature");
  // Exclude the provenance asset ID and digest from its own signed manifest binding.
  // The complete downloaded signed manifest is independently bound by the
  // subject.provenanceDigest and asset ID check, avoiding a construction-time hash/ID cycle.
  const { provenanceDigest, provenanceAssetId, ...immutableSubjectWithoutProvenanceHash } = subject;
  demand(value.schema === "opstruth.release-v1.provenance.v1" &&
    value.subjectDigest === await sha256(stableJson(immutableSubjectWithoutProvenanceHash)) &&
    value.packageSha256 === packageSha && typeof value.issuer === "string" &&
    /^[a-zA-Z0-9._:-]{3,128}$/.test(value.issuer), "provenance_binding");
  const t = Date.parse(value.issuedAt);
  demand(typeof value.issuedAt === "string" && Number.isFinite(t) &&
    t <= observedAt + 60_000 && t >= observedAt - 31 * 24 * 3600_000, "provenance_time");
  demand(value.signature.algorithm === "Ed25519", "provenance_algorithm");
  const der = derFromPem(value.signature.publicKeyPem);
  const fingerprint = "sha256:" + await sha256(der);
  demand(value.signature.signerFingerprint === fingerprint &&
    trustedFingerprints.includes(fingerprint), "provenance_signer_untrusted");
  const key = await crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
  const { signature, ...unsigned } = value;
  const input = bytes.encode(RELEASE_PROVENANCE_DOMAIN + stableJson(unsigned));
  demand(await crypto.subtle.verify("Ed25519", key, decodeSignature(signature.signatureBase64), input),
    "provenance_signature_invalid");
  return fingerprint;
}
/**
 * Read-only source kit, NOT a public MCP tool or signed OpsTruth attestation.
 * The injected reader must perform only bounded, brokered GETs with no mutation
 * authority. No credential enters this API and responses are never cached.
 * VERIFIED here means exact observed bytes, not DoneState terminal VERIFIED.
 */
export async function verifyReleaseV1Bytes({ subject, reader, trustedProvenanceFingerprints,
  now = Date.now(), maxAgeMs = MAX_AGE_MS }) {
  const result = (verdict, reasonCode, evidence = {}) => ({
    schema: "opstruth.release-v1.observation.v1", verdict, reasonCode,
    subjectDigest: null, observedAt: new Date(now).toISOString(), readOnly: true,
    source: "injected-read-only-release-reader", independentAttestationIssued: false,
    ...evidence,
  });
  try {
    checkSubject(subject);
    demand(reader && typeof reader.observe === "function" &&
      typeof reader.downloadAsset === "function", "reader_required");
    demand(Array.isArray(trustedProvenanceFingerprints) && trustedProvenanceFingerprints.length > 0 &&
      trustedProvenanceFingerprints.every(x => DIGEST.test(x)), "provenance_trust_required");
    demand(Number.isFinite(now) && maxAgeMs > 0 && maxAgeMs <= MAX_AGE_MS, "freshness_policy");
  } catch {
    return result("UNPROVEN", "invalid_verification_request");
  }
  const subjectDigest = await sha256(stableJson(subject));
  let metadata, packageBytes, provenanceBytes;
  try {
    metadata = await reader.observe(subject);
    packageBytes = await reader.downloadAsset(subject.packageAssetId, MAX_PACKAGE_BYTES);
    provenanceBytes = await reader.downloadAsset(subject.provenanceAssetId, MAX_PROVENANCE_BYTES);
    checkBytes(packageBytes, MAX_PACKAGE_BYTES, "package");
    checkBytes(provenanceBytes, MAX_PROVENANCE_BYTES, "provenance");
  } catch {
    return result("UNPROVEN", "provider_read_unavailable", { subjectDigest });
  }
  try {
    checkMetadata(metadata, subject);
    const publishedAt = Date.parse(metadata.publishedAt);
    demand(publishedAt <= now + 60_000 && publishedAt >= now - maxAgeMs, "release_observation_stale");
    const actualPackageSha = await sha256(packageBytes);
    const actualProvenanceSha = await sha256(provenanceBytes);
    demand("sha256:" + actualPackageSha === subject.packageDigest &&
      "sha256:" + actualProvenanceSha === subject.provenanceDigest, "artifact_digest_mismatch");
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(provenanceBytes);
    demand(decoded.length <= MAX_PROVENANCE_BYTES && !decoded.includes("\0"), "provenance_encoding");
    const manifest = JSON.parse(decoded);
    const fingerprint = await checkProvenance(manifest, subject, actualPackageSha,
      trustedProvenanceFingerprints, now);
    return result("VERIFIED", "exact_release_bytes_and_signed_provenance_match", {
      subjectDigest, packageSha256: actualPackageSha, provenanceSha256: actualProvenanceSha,
      provenanceSignerFingerprint: fingerprint, releaseId: subject.releaseId,
      repositoryId: subject.repositoryId, tagCommit: subject.tagCommit,
      bytesObserved: { package: packageBytes.byteLength, provenance: provenanceBytes.byteLength },
    });
  } catch (error) {
    return result("CONTRADICTED", error instanceof Error && error.message.startsWith("release_verification:") ?
      error.message.split(":")[1] : "invalid_provenance_or_metadata", { subjectDigest });
  }
}
