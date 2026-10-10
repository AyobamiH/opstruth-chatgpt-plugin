import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { canonicalJson } from "../src/canonical.js";
import { privateVerificationResponse } from "../src/private-verification.js";
import { callTool } from "../src/tools.js";
import worker from "../src/worker.js";
import { sha256 } from "../src/utils.js";
import { testSigningEnv } from "./protocol-fixtures.js";
const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);
const TOKEN = "fixture_private_bridge_" + "a".repeat(32);
const PRINCIPAL = "a".repeat(64);
const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
function policy(overrides = {}) {
  return { accountSubjectSha256: PRINCIPAL, repository: "Example/project", repositoryId: "424242", installationId: "987654", issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), ...overrides };
}
function env(overrides = {}) {
  return { ...testSigningEnv(), OPSTRUTH_GITHUB_APP_ID: "111", OPSTRUTH_PRIVATE_GITHUB_APP_ID: "123456", OPSTRUTH_PRIVATE_GITHUB_APP_PRIVATE_KEY_PEM: key, OPSTRUTH_PRIVATE_BRIDGE_TOKEN: TOKEN, OPSTRUTH_PRIVATE_VERIFICATION_POLICY: JSON.stringify(policy()), ...overrides };
}
function request(body, token = TOKEN) {
  return new Request("https://example.test/internal/donestate-private-verification", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
async function handoff(overrides = {}) {
  const payload = {
    schema: "donestate.verification-handoff.v2",
    runId: "11111111-1111-4111-8111-111111111111",
    generatedAt: new Date().toISOString(),
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
    if (url.hostname === "api.github.com" && url.pathname === "/app/installations/987654/access_tokens") {
      assert.equal(request.method, "POST");
      assert.deepEqual(await request.json(), {
        repositories: ["project"],
        permissions: { checks: "read", contents: "read", statuses: "read" },
      });
      return Response.json({
        token: "fixture-installation-token",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        permissions: { checks: "read", contents: "read", metadata: "read", statuses: "read" },
        repository_selection: "selected",
        repositories: [{ id: 424242, full_name: "Example/project", private: true, visibility: "private" }],
      });
    }
    if (url.hostname === "api.github.com") {
      assert.equal(request.headers.get("authorization"), "Bearer fixture-installation-token");
    }
    if (url.hostname === "api.github.com" && url.pathname === "/repos/Example/project") {
      return Response.json({ id: 424242, full_name: "Example/project", html_url: "https://github.com/Example/project", visibility: "private", private: true });
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
    if (url.hostname === "api.github.com" && url.pathname === "/repos/Example/project/contents/README.md") {
      assert.equal(url.searchParams.get("ref"), HEAD);
      return Response.json({ type: "file", path: "README.md", sha: "readme", size: Buffer.byteLength(readme), encoding: "base64", content: Buffer.from(readme).toString("base64") });
    }
    if (url.hostname === "api.github.com" && url.pathname === "/repos/Example/project/contents/package.json") {
      const body = '{"name":"fixture"}';
      assert.equal(url.searchParams.get("ref"), HEAD);
      return Response.json({ type: "file", path: "package.json", sha: "package", size: Buffer.byteLength(body), encoding: "base64", content: Buffer.from(body).toString("base64") });
    }
    if (url.hostname === "raw.githubusercontent.com") assert.fail("verification evidence must not use anonymous raw GitHub reads");
    return new Response("unexpected", { status: 500 });
  };
  return () => { globalThis.fetch = original; };
}


test("private route authenticates before parsing or fetching, and emits no CORS or identifying analytics", async () => {
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected"); };
  try {
    for (const token of ["", "wrong", TOKEN + "x"]) {
      const result = await worker.fetch(request("not JSON", token), env({ OPSTRUTH_ANALYTICS: { writeDataPoint() { assert.fail("private analytics prohibited"); } } }), {});
      assert.equal(result.status, 401);
      assert.equal(result.headers.get("access-control-allow-origin"), null);
      assert.equal(result.headers.get("cache-control"), "no-store");
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("expired, future, overlong, extra-field and invalid policies fail closed before network", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("policy failure must not fetch");
  try {
    const now = Date.now();
    const bad = [
      { expiresAt: new Date(now - 1).toISOString() },
      { issuedAt: new Date(now + 10000).toISOString() },
      { expiresAt: new Date(now + 8 * 86400000).toISOString() },
      { extra: "denied" }, { repositoryId: "0" }, { repositoryId: 424242 },
      { accountSubjectSha256: "bad" }, { repository: "Example/../other" },
    ];
    for (const change of bad) {
      const result = await privateVerificationResponse(request({}), env({ OPSTRUTH_PRIVATE_VERIFICATION_POLICY: JSON.stringify(policy(change)) }));
      assert.equal(result.status, 503, JSON.stringify(change));
    }
    const sameApp = await privateVerificationResponse(request({}), env({ OPSTRUTH_PRIVATE_GITHUB_APP_ID: "111" }));
    assert.equal(sameApp.status, 503);
  } finally { globalThis.fetch = previous; }
});

test("private route binds caller and repository and rejects extra fields and oversized streaming bodies", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("admission failure must not fetch");
  try {
    for (const body of [
      { accountSubjectSha256: "b".repeat(64), handoff: { subject: { repository: "Example/project" } } },
      { accountSubjectSha256: PRINCIPAL, handoff: { subject: { repository: "Example/other" } } },
      { accountSubjectSha256: PRINCIPAL, handoff: { subject: { repository: "Example/project" } }, extra: true },
    ]) assert.equal((await privateVerificationResponse(request(body), env())).status, 403);
    assert.equal((await privateVerificationResponse(request("x".repeat(256 * 1024 + 1)), env())).status, 400);
  } finally { globalThis.fetch = previous; }
});

test("authenticated private route independently reads and signs the unchanged v2 contract", async () => {
  const restore = installFetchMock();
  try {
    const result = await privateVerificationResponse(request({ accountSubjectSha256: PRINCIPAL, handoff: await handoff() }), env());
    assert.equal(result.status, 200);
    const bundle = await result.json();
    assert.equal(bundle.contractVersion, "donestate.verification-contract.v2");
    assert.equal(bundle.report.decision, "verified");
    assert.equal(bundle.attestation.decision, "verified");
    assert.equal(bundle.report.changedState, false);
    assert.ok(bundle.attestation.signature.signatureBase64);
  } finally { restore(); }
});

test("public MCP cannot reach private credentials even for a valid private handoff", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("public tool cannot mint private installation tokens");
  try { await assert.rejects(callTool("opstruth_attest_donestate_handoff", { handoff: await handoff() }, env(), {})); }
  finally { globalThis.fetch = previous; }
});
