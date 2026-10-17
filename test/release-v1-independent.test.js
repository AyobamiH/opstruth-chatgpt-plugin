import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { sha256, stableJson } from "../src/utils.js";
import { RELEASE_PROVENANCE_DOMAIN, verifyReleaseV1Bytes } from "../verification-kits/release-v1/verify.js";

const now = Date.parse("2026-10-17T19:22:00.000Z");
const issuer = generateKeyPairSync("ed25519");
const publicKeyPem = issuer.publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKey = issuer.privateKey;
const spkiDer = issuer.publicKey.export({ type: "spki", format: "der" });
const bytes = new TextEncoder();
const packageBytes = bytes.encode("a valid canary package, not a live customer artifact");
const baseSubject = {
  schema: "opstruth.release-v1.subject.v1", owner: "TestOrg", repository: "isolated-release",
  ownerId: 47, repositoryId: 500, releaseId: 101,
  tagName: "v1.2.3-rc.1", tagCommit: "a".repeat(40),
  packageAssetId: 5, packageAssetName: "package.tgz", packageDigest: "",
  provenanceAssetId: 6, provenanceDigest: "",
};
async function fixture() {
  const signer = "sha256:" + await sha256(spkiDer);
  const withoutManifestDigest = { ...baseSubject, packageDigest: "sha256:" + await sha256(packageBytes) };
  const { provenanceDigest, ...subjectForManifest } = withoutManifestDigest;
  const unsigned = {
    schema: "opstruth.release-v1.provenance.v1",
    subjectDigest: await sha256(stableJson(subjectForManifest)),
    packageSha256: await sha256(packageBytes),
    issuer: "external-provenance-fixture",
    issuedAt: new Date(now - 1000).toISOString(),
  };
  const input = RELEASE_PROVENANCE_DOMAIN + stableJson(unsigned);
  const signatureBase64 = sign(null, Buffer.from(input), privateKey).toString("base64");
  const manifest = {
    ...unsigned,
    signature: { algorithm: "Ed25519", publicKeyPem, signerFingerprint: signer, signatureBase64 },
  };
  const provenanceBytes = bytes.encode(JSON.stringify(manifest));
  const subject = { ...withoutManifestDigest, provenanceDigest: "sha256:" + await sha256(provenanceBytes) };
  const metadata = { owner: subject.owner, repository: subject.repository,
    ownerId: subject.ownerId, repositoryId: subject.repositoryId, releaseId: subject.releaseId,
    tagName: subject.tagName, tagCommit: subject.tagCommit,
    prerelease: true, draft: false, publishedAt: new Date(now - 2000).toISOString(),
    packageAssetId: subject.packageAssetId, packageAssetName: subject.packageAssetName,
    packageDigest: subject.packageDigest, provenanceAssetId: subject.provenanceAssetId,
    provenanceDigest: subject.provenanceDigest, assetCount: 2 };
  const reads = { observe: 0, assets: [] };
  const reader = {
    async observe() { reads.observe++; return metadata; },
    async downloadAsset(id, maxBytes) {
      reads.assets.push([id, maxBytes]);
      if (id === subject.packageAssetId) return packageBytes;
      if (id === subject.provenanceAssetId) return provenanceBytes;
      throw Error("unknown asset");
    },
  };
  return { subject, metadata, reader, reads, signer, provenanceBytes };
}
const run = (f, changes = {}) => verifyReleaseV1Bytes({
  subject: f.subject, reader: f.reader, trustedProvenanceFingerprints: [f.signer], now, ...changes,
});

test("observes exact published bytes and signed provenance independently, without a signed OpsTruth verdict", async () => {
  const f = await fixture();
  const output = await run(f);
  assert.equal(output.verdict, "VERIFIED");
  assert.equal(output.reasonCode, "exact_release_bytes_and_signed_provenance_match");
  assert.equal(output.independentAttestationIssued, false);
  assert.equal(output.readOnly, true);
  assert.equal(output.packageSha256, f.subject.packageDigest.slice(7));
  assert.equal(output.provenanceSha256, f.subject.provenanceDigest.slice(7));
  assert.equal(output.provenanceSignerFingerprint, f.signer);
  assert.equal(f.reads.observe, 1);
  assert.deepEqual(f.reads.assets.map(x=>x[0]), [5, 6]);
});

test("changed package bytes or provenance bytes cannot pass provider metadata readback", async () => {
  const f = await fixture();
  const original = f.reader.downloadAsset;
  f.reader.downloadAsset = async (id, max) => {
    const value = await original(id, max);
    return id === f.subject.packageAssetId ? bytes.encode("tampered package") : value;
  };
  assert.equal((await run(f)).reasonCode, "artifact_digest_mismatch");
  f.reader.downloadAsset = async (id, max) => {
    const value = await original(id, max);
    return id === f.subject.provenanceAssetId ? bytes.encode("altered provenance") : value;
  };
  assert.equal((await run(f)).reasonCode, "artifact_digest_mismatch");
});

test("wrong release tag/repo/owner identity and extra assets are contradictions", async () => {
  for (const [name, value] of [
    ["repositoryId", 999], ["releaseId", 999], ["tagCommit", "f".repeat(40)],
    ["packageDigest", "sha256:" + "0".repeat(64)], ["assetCount", 3], ["draft", true],
  ]) {
    const f = await fixture();f.metadata[name] = value;
    const output = await run(f);
    assert.equal(output.verdict, "CONTRADICTED", name);
  }
});

test("untrusted provenance signer or missing actual asset bytes cannot yield VERIFIED", async () => {
  const f = await fixture();
  const untrusted = await run(f, { trustedProvenanceFingerprints: ["sha256:" + "b".repeat(64)] });
  assert.equal(untrusted.verdict, "CONTRADICTED");
  assert.equal(untrusted.reasonCode, "provenance_signer_untrusted");
  const original = f.reader.downloadAsset;
  f.reader.downloadAsset = async id => id === f.subject.packageAssetId ? new Uint8Array() : original(id);
  const missing = await run(f);
  assert.equal(missing.verdict, "UNPROVEN");
  assert.equal(missing.reasonCode, "provider_read_unavailable");
});

test("stale published observation and unavailable provider remain unproven or contradicted", async () => {
  const f = await fixture();f.metadata.publishedAt = new Date(now - 20 * 60_000).toISOString();
  assert.equal((await run(f)).reasonCode, "release_observation_stale");
  f.reader.observe = async () => { throw Error("provider down"); };
  assert.equal((await run(f)).reasonCode, "provider_read_unavailable");
});

test("invalid subject, absent signer pins and wrong reader fail before any external read", async () => {
  const f = await fixture();
  const invalid = await run(f, { subject: { ...f.subject, releaseId: 0 } });
  assert.equal(invalid.verdict, "UNPROVEN"); assert.equal(invalid.reasonCode, "invalid_verification_request");
  assert.equal(f.reads.observe, 0);
  assert.equal((await run(f, { trustedProvenanceFingerprints: [] })).verdict, "UNPROVEN");
  assert.equal((await run(f, { reader: {} })).verdict, "UNPROVEN");
  assert.equal(f.reads.observe, 0);
});

test("provenance content/Ed25519 signature are independently checked even when bundle hash is pinned", async () => {
  const f = await fixture();
  // A malicious publisher might replace the bytes AND update the caller-supplied digest;
  // the independent pinned provenance signer still prevents that from validating.
  const manifest = JSON.parse(new TextDecoder().decode(f.provenanceBytes));
  manifest.signature.signatureBase64 = Buffer.alloc(64, 9).toString("base64");
  const altered = bytes.encode(JSON.stringify(manifest));
  f.subject.provenanceDigest = "sha256:" + await sha256(altered);
  f.metadata.provenanceDigest = f.subject.provenanceDigest;
  const previous = f.reader.downloadAsset;
  f.reader.downloadAsset = async (id, max) => id === f.subject.provenanceAssetId ? altered : previous(id, max);
  const output = await run(f);
  assert.equal(output.verdict, "CONTRADICTED");
  assert.equal(output.reasonCode, "provenance_signature_invalid");
});
