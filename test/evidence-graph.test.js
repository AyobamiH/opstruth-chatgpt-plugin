import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildEvidenceGraph, compareEvidenceGraphs, detectContradictions, verifyEvidenceGraph } from "../src/evidence-graph.js";
import { loadRepositorySnapshot } from "../src/github.js";
import { signProtocolArtifact } from "../src/protocol.js";
import { validateAgainstSchema } from "../scripts/validate-contracts.mjs";
import { installGithubFetchMock } from "./fixtures.js";

const graphSchema = JSON.parse(await readFile(new URL("../schemas/evidence-graph.schema.json", import.meta.url), "utf8"));
const deltaSchema = JSON.parse(await readFile(new URL("../schemas/evidence-delta.schema.json", import.meta.url), "utf8"));

function signingEnv() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

async function fixtureGraph(env, observedAt = "2026-08-27T12:00:00Z") {
  const snapshot = await loadRepositorySnapshot("Example/project", {}, {});
  return buildEvidenceGraph({ repositorySnapshot: snapshot, observedAt, env });
}

test("Evidence Graph v1 is deterministic, schema-valid and independently verifiable", async () => {
  const restore = installGithubFetchMock();
  try {
    const env = signingEnv();
    const first = await fixtureGraph(env);
    const second = await fixtureGraph(env);
    assert.deepEqual(first, second);
    assert.deepEqual(validateAgainstSchema(first, graphSchema), []);
    assert.equal(first.subject.repositoryId, "424242");
    assert.equal(first.summary.verdict, "VERIFIED");
    const verification = await verifyEvidenceGraph(first, { trustedSignerFingerprints: [first.proof.signerFingerprint], now: "2026-08-27T12:00:01Z" });
    assert.equal(verification.valid, true);
    assert.equal(verification.signatureValid, true);
    assert.equal(verification.trusted, true);
    assert.deepEqual(verification.staleNodeIds, []);
  } finally {
    restore();
  }
});

test("tampering and subject-incompatible comparison fail closed", async () => {
  const restore = installGithubFetchMock();
  try {
    const env = signingEnv();
    const graph = await fixtureGraph(env);
    const tampered = structuredClone(graph);
    tampered.nodes[0].attributes.defaultBranch = "evil";
    const verification = await verifyEvidenceGraph(tampered, { now: "2026-08-27T12:00:01Z" });
    assert.equal(verification.valid, false);
    assert.ok(verification.errors.some((error) => error.startsWith("node_digest_mismatch")));
    await assert.rejects(() => compareEvidenceGraphs(tampered, graph, { comparedAt: "2026-08-27T12:00:01Z" }), /before_invalid/);

    const inconsistent = structuredClone(graph);
    inconsistent.summary.counts.nodes = 0;
    const resigned = await signProtocolArtifact(inconsistent, env);
    const semanticVerification = await verifyEvidenceGraph(resigned, { now: "2026-08-27T12:00:01Z" });
    assert.equal(semanticVerification.signatureValid, true);
    assert.ok(semanticVerification.errors.includes("graph_node_count_mismatch"));
    assert.ok(semanticVerification.errors.includes("graph_id_mismatch"));

    const incompatibleSnapshot = await loadRepositorySnapshot("Example/project", {}, {});
    incompatibleSnapshot.repository.providerRepositoryId = "different";
    const incompatible = await buildEvidenceGraph({ repositorySnapshot: incompatibleSnapshot, observedAt: "2026-08-27T12:00:00Z", env });
    await assert.rejects(() => compareEvidenceGraphs(graph, incompatible, { comparedAt: "2026-08-27T12:05:00Z" }), /subject_incompatible/);
  } finally {
    restore();
  }
});

test("compatible signed snapshots produce a deterministic delta", async () => {
  const restore = installGithubFetchMock();
  try {
    const env = signingEnv();
    const before = await fixtureGraph(env, "2026-08-27T12:00:00Z");
    const after = await fixtureGraph(env, "2026-08-27T12:05:00Z");
    const first = await compareEvidenceGraphs(before, after, { comparedAt: "2026-08-27T12:06:00Z", trustedSignerFingerprints: [before.proof.signerFingerprint] });
    const second = await compareEvidenceGraphs(before, after, { comparedAt: "2026-08-27T12:06:00Z", trustedSignerFingerprints: [before.proof.signerFingerprint] });
    assert.deepEqual(first, second);
    assert.deepEqual(validateAgainstSchema(first, deltaSchema), []);
    assert.ok(first.nodeChanges.changed.length > 0);
    assert.equal(first.nodeChanges.stale.length, 0);
  } finally {
    restore();
  }
});

test("portable snapshots retain integrity while reporting freshness expiry", async () => {
  const restore = installGithubFetchMock();
  try {
    const graph = await fixtureGraph(signingEnv(), "2026-08-27T12:00:00Z");
    const verification = await verifyEvidenceGraph(graph, { now: "2026-08-27T12:06:00Z" });
    assert.equal(verification.digestValid, true);
    assert.equal(verification.signatureValid, true);
    assert.ok(verification.staleNodeIds.length > 0);
  } finally {
    restore();
  }
});

test("deterministic contradiction rules preserve all conflict classes", () => {
  const node = (id, type, attributes) => ({ id: `urn:test:${id}`, type, attributes });
  const nodes = [
    node("commit", "commit", { role: "observed_head", sha: "a".repeat(40) }),
    node("ci", "ci_run", { currentRelease: true, headCommitSha: "b".repeat(40) }),
    node("artifact-a", "artifact", { releaseAssertion: "release-1", contentDigest: `sha256:${"a".repeat(64)}` }),
    node("artifact-b", "artifact", { releaseAssertion: "release-1", contentDigest: `sha256:${"b".repeat(64)}` }),
    node("deploy-a", "deployment", { active: true, environment: "production", commitSha: "a".repeat(40) }),
    node("deploy-b", "deployment", { active: true, environment: "production", commitSha: "b".repeat(40) }),
    node("route", "configuration", { kind: "declared_route", path: "/health", deploymentRef: "prod" }),
    node("probe", "runtime_observation", { path: "/health", deploymentRef: "prod", ok: false }),
    node("request", "action_request", { requestId: "request-1", digest: `sha256:${"c".repeat(64)}`, presentedAsCurrent: true }),
    node("receipt", "execution_receipt", { requestId: "request-1", requestDigest: `sha256:${"d".repeat(64)}` }),
    node("later", "finding", { supersedesNodeId: "urn:test:request" }),
  ];
  assert.deepEqual(detectContradictions(nodes).map((item) => item.rule), [
    "active_deployment_mismatch",
    "artifact_digest_mismatch",
    "ci_commit_mismatch",
    "declared_route_runtime_absent",
    "receipt_request_mismatch",
    "superseded_claim_presented_current",
  ]);
});
