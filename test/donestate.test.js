import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "../src/canonical.js";
import { verifyDoneStateHandoff } from "../src/donestate.js";
import { callTool } from "../src/tools.js";
import { pemBytes, sha256 } from "../src/utils.js";
import { testSigningEnv } from "./protocol-fixtures.js";

const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);
const GENERATED_AT = "2026-08-28T12:00:00.000Z";
const OBSERVED_AT = "2026-08-28T12:01:00.000Z";

async function handoff(overrides = {}) {
  const payload = {
    schema: "donestate.verification-handoff.v2",
    runId: "11111111-1111-4111-8111-111111111111",
    generatedAt: GENERATED_AT,
    objectiveDigest: "a".repeat(64),
    executionSnapshotDigest: "b".repeat(64),
    verificationNonce: "c".repeat(64),
    repositoryRoot: `https://github.com/Example/project/tree/${HEAD}`,
    subject: {
      repository: "Example/project",
      baseRef: "main",
      baseHeadSha: BASE,
      branchName: "donestate/run",
      headSha: HEAD,
      publication: "branch",
      pullRequestNumber: null,
      pullRequestUrl: null,
    },
    acceptanceCriteria: ["README carries the product boundary.", "Only approved files changed.", "CI passes."],
    verificationRequirements: [
      { id: "readme_boundary", criterionIndex: 0, kind: "file_contains", path: "README.md", values: ["DoneState", "Proof & State", "OpsTruth"] },
      { id: "file_boundary", criterionIndex: 1, kind: "changed_files", max: 2, allowedPaths: ["README.md", "package.json"] },
      { id: "ci_passes", criterionIndex: 2, kind: "github_checks_pass", requiredNames: ["CI"] },
    ],
    actions: [{
      id: "push-branch",
      state: "SUCCEEDED",
      authority: "push",
      idempotencyKey: "run:push:v1",
      intentDigest: "d".repeat(64),
      resultDigest: "e".repeat(64),
    }],
    eventChainHead: "f".repeat(64),
    ...overrides,
  };
  return {
    ...payload,
    handoffDigest: await sha256(`donestate.verification-handoff.v2\0${canonicalJson(payload)}`),
  };
}

function installFetchMock(
  readme = "# DoneState\nProof & State execution with independent OpsTruth verification.",
  checkStates = [{ status: "completed", conclusion: "success" }],
) {
  const original = globalThis.fetch;
  let checkRequest = 0;
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "api.github.com" && url.pathname === "/repos/Example/project") {
      return Response.json({ id: 424242, full_name: "Example/project", html_url: "https://github.com/Example/project", visibility: "public", private: false });
    }
    if (url.hostname === "api.github.com" && url.pathname === `/repos/Example/project/commits/${HEAD}`) {
      return Response.json({ sha: HEAD, html_url: `https://github.com/Example/project/commit/${HEAD}` });
    }
    if (url.hostname === "api.github.com" && url.pathname === `/repos/Example/project/git/trees/${HEAD}`) {
      return Response.json({ sha: "tree", truncated: false, tree: [
        { path: "README.md", type: "blob", size: readme.length, sha: "readme" },
        { path: "package.json", type: "blob", size: 30, sha: "package" },
      ] });
    }
    if (url.hostname === "api.github.com" && url.pathname === `/repos/Example/project/compare/${BASE}...${HEAD}`) {
      return Response.json({ status: "ahead", ahead_by: 1, behind_by: 0, files: [
        { filename: "README.md", status: "modified", additions: 3, deletions: 1, changes: 4, blob_url: `https://github.com/Example/project/blob/${HEAD}/README.md` },
        { filename: "package.json", status: "modified", additions: 1, deletions: 1, changes: 2, blob_url: `https://github.com/Example/project/blob/${HEAD}/package.json` },
      ] });
    }
    if (url.hostname === "api.github.com" && url.pathname === `/repos/Example/project/commits/${HEAD}/check-runs`) {
      const state = checkStates[Math.min(checkRequest, checkStates.length - 1)];
      checkRequest += 1;
      return Response.json({ total_count: 1, check_runs: [{ name: "CI", ...state, html_url: "https://github.com/Example/project/actions/runs/1" }] });
    }
    if (url.hostname === "api.github.com" && url.pathname === `/repos/Example/project/commits/${HEAD}/status`) {
      return Response.json({ state: "success", statuses: [] });
    }
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith(`/${HEAD}/README.md`)) return new Response(readme);
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith(`/${HEAD}/package.json`)) return new Response('{"name":"fixture"}');
    return new Response("unexpected", { status: 500 });
  };
  return () => { globalThis.fetch = original; };
}

function installCacheMock() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const values = new Map();
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match(request) {
          const response = values.get(request.url);
          return response ? response.clone() : undefined;
        },
        async put(request, response) {
          values.set(request.url, response.clone());
        },
      },
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "caches", previous);
    else delete globalThis.caches;
  };
}

async function signatureValid(attestation) {
  const publicDer = pemBytes(attestation.signature.publicKeyPem, "PUBLIC KEY");
  assert.equal(attestation.signature.signerFingerprint, await sha256(publicDer));
  const key = await crypto.subtle.importKey("spki", publicDer, { name: "Ed25519" }, false, ["verify"]);
  const signature = Uint8Array.from(atob(attestation.signature.signatureBase64), (character) => character.charCodeAt(0));
  const { signature: _proof, ...unsigned } = attestation;
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signature,
    new TextEncoder().encode(`donestate.verification-attestation.v2\0${canonicalJson(unsigned)}`),
  );
}

test("OpsTruth independently verifies and signs an exact DoneState v2 handoff", async () => {
  const restore = installFetchMock();
  try {
    const verification = await verifyDoneStateHandoff(await handoff(), testSigningEnv(), {}, { observedAt: OBSERVED_AT });
    assert.equal(verification.report.decision, "verified");
    assert.ok(verification.report.requirementResults.every((item) => item.verdict === "VERIFIED"));
    assert.equal(verification.attestation.decision, "verified");
    assert.equal(await signatureValid(verification.attestation), true);
  } finally {
    restore();
  }
});

test("OpsTruth refreshes exact-head GitHub checks between pending and successful verification attempts", async () => {
  const restoreFetch = installFetchMock(undefined, [
    { status: "in_progress", conclusion: null },
    { status: "completed", conclusion: "success" },
  ]);
  const restoreCache = installCacheMock();
  try {
    const pending = await verifyDoneStateHandoff(await handoff(), testSigningEnv(), {}, { observedAt: OBSERVED_AT });
    assert.equal(pending.report.decision, "uncertain");
    assert.equal(pending.report.requirementResults[2].reasonCode, "github_checks_pending");

    const successful = await verifyDoneStateHandoff(await handoff(), testSigningEnv(), {}, { observedAt: OBSERVED_AT });
    assert.equal(successful.report.decision, "verified");
    assert.equal(successful.report.requirementResults[2].reasonCode, "github_checks_satisfied");
  } finally {
    restoreCache();
    restoreFetch();
  }
});

test("OpsTruth treats a terminal non-success GitHub check as failed", async () => {
  const restore = installFetchMock(undefined, [{ status: "completed", conclusion: "neutral" }]);
  try {
    const verification = await verifyDoneStateHandoff(await handoff(), testSigningEnv(), {}, { observedAt: OBSERVED_AT });
    assert.equal(verification.report.decision, "failed");
    assert.equal(verification.report.requirementResults[2].reasonCode, "github_checks_terminal_failure");
  } finally {
    restore();
  }
});

test("OpsTruth exposes a DoneState-compatible public verifier fingerprint", async () => {
  const identity = (await callTool("opstruth_get_verifier_identity", {}, testSigningEnv(), {})).structuredContent;
  assert.match(identity.signerFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(identity.doneStateSignerFingerprint, identity.signerFingerprint.slice("sha256:".length));
  assert.equal(identity.publicKeyPem.includes("PRIVATE KEY"), false);
});

test("OpsTruth signs a failed decision when fresh evidence contradicts sealed content", async () => {
  const restore = installFetchMock("# Unrelated product");
  try {
    const verification = await verifyDoneStateHandoff(await handoff(), testSigningEnv(), {}, { observedAt: OBSERVED_AT });
    assert.equal(verification.report.decision, "failed");
    assert.equal(verification.attestation.decision, "failed");
    assert.equal(await signatureValid(verification.attestation), true);
  } finally {
    restore();
  }
});

test("OpsTruth rejects handoff drift before reading or signing", async () => {
  const document = await handoff();
  document.subject.headSha = "3".repeat(40);
  await assert.rejects(
    verifyDoneStateHandoff(document, testSigningEnv(), {}, { observedAt: OBSERVED_AT }),
    /handoff_digest_mismatch|repository_subject_mismatch/,
  );
});

test("MCP exposes the DoneState bridge without submitting the attestation", async () => {
  const restore = installFetchMock();
  try {
    const response = await callTool("opstruth_attest_donestate_handoff", { handoff: await handoff() }, testSigningEnv(), {});
    assert.equal(response.structuredContent.report.decision, "verified");
    assert.match(response.content[0].text, /attestation was not submitted/);
  } finally {
    restore();
  }
});

test("portable DoneState v2 vector preserves cross-product digests and signature", async () => {
  const vector = JSON.parse(await readFile(new URL("../contracts/vectors/donestate-v2.json", import.meta.url), "utf8"));
  const handoffPayload = { ...vector.handoff };
  delete handoffPayload.handoffDigest;
  assert.equal(
    vector.handoff.handoffDigest,
    await sha256(`donestate.verification-handoff.v2\0${canonicalJson(handoffPayload)}`),
  );
  assert.equal(
    vector.attestation.verificationReportDigest,
    await sha256(`opstruth.donestate-verification-report.v1\0${canonicalJson(vector.verificationReport)}`),
  );
  assert.equal(await signatureValid(vector.attestation), true);
});
