import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { loadCommitVerificationEvidence } from "../src/github.js";

const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);
const CONTENT = "# selected verification evidence";
const githubAppPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;

function appEnv(overrides = {}) {
  return {
    OPSTRUTH_GITHUB_APP_ID: "123456",
    OPSTRUTH_GITHUB_APP_INSTALLATION_ID: "987654",
    OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: githubAppPrivateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY: "Example/project",
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID: "424242",
    ...overrides,
  };
}

function installVerificationFetch(options = {}) {
  const original = globalThis.fetch;
  const observations = { apiAuthorizations: [], rawRequests: 0, tokenMints: 0, tokenBody: null };
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "raw.githubusercontent.com") {
      observations.rawRequests += 1;
      return new Response("anonymous raw access is prohibited", { status: 500 });
    }
    if (url.hostname !== "api.github.com") return new Response("unexpected host", { status: 500 });
    if (url.pathname === "/app/installations/987654/access_tokens") {
      observations.tokenMints += 1;
      observations.tokenBody = await request.json();
      return Response.json({
        token: "installation-token-sentinel",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        permissions: { checks: "read", contents: "read", metadata: "read", statuses: "read" },
        repository_selection: "selected",
        repositories: [{ id: 424242, full_name: "Example/project", private: false, visibility: "public" }],
      });
    }
    observations.apiAuthorizations.push(request.headers.get("authorization"));
    if (url.pathname === "/repos/Example/project") {
      return Response.json({
        id: 424242,
        full_name: "Example/project",
        html_url: "https://github.com/Example/project",
        visibility: "public",
        private: false,
        ...options.metadata,
      });
    }
    if (url.pathname === `/repos/Example/project/commits/${HEAD}`) {
      return Response.json({ sha: HEAD, html_url: `https://github.com/Example/project/commit/${HEAD}` });
    }
    if (url.pathname === `/repos/Example/project/git/trees/${HEAD}`) {
      return Response.json({ sha: "tree", truncated: false, tree: [{ path: "README.md", type: "blob", size: Buffer.byteLength(CONTENT), sha: "readme-sha" }] });
    }
    if (url.pathname === `/repos/Example/project/compare/${BASE}...${HEAD}`) {
      return Response.json({ status: "ahead", ahead_by: 1, behind_by: 0, files: [{ filename: "README.md", status: "modified" }] });
    }
    if (url.pathname === `/repos/Example/project/commits/${HEAD}/check-runs`) {
      if (options.checksResponse) return options.checksResponse();
      return Response.json({ total_count: 1, check_runs: [{ name: "CI", status: "completed", conclusion: "success" }] });
    }
    if (url.pathname === `/repos/Example/project/commits/${HEAD}/status`) {
      return Response.json({ state: "success", statuses: [{ context: "CI", state: "success" }] });
    }
    if (url.pathname === "/repos/Example/project/contents/README.md") {
      assert.equal(url.searchParams.get("ref"), HEAD);
      return Response.json(options.contentPayload || {
        type: "file",
        path: "README.md",
        sha: "readme-sha",
        size: Buffer.byteLength(CONTENT),
        encoding: "base64",
        content: Buffer.from(CONTENT).toString("base64"),
      });
    }
    return new Response("unexpected path", { status: 500 });
  };
  return { observations, restore: () => { globalThis.fetch = original; } };
}

function rejectVerificationCacheAccess() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match() { assert.fail("authenticated verification requests must not enter the Cache API"); },
        async put() { assert.fail("authenticated verification responses must not enter the Cache API"); },
      },
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "caches", previous);
    else delete globalThis.caches;
  };
}

test("exact-commit verification uses only installation-authenticated API and Contents reads", async () => {
  const { observations, restore } = installVerificationFetch();
  const restoreCaches = rejectVerificationCacheAccess();
  try {
    const evidence = await loadCommitVerificationEvidence({
      repository: "Example/project",
      baseSha: BASE,
      headSha: HEAD,
      paths: ["README.md"],
    }, appEnv({ GITHUB_READ_TOKEN: "legacy-token-must-not-be-used" }));
    assert.equal(evidence.files[0].text, CONTENT);
    assert.deepEqual(evidence.repository.evidenceAuthority, {
      mode: "github_app_installation",
      scope: "selected_public_repository",
    });
    assert.equal(observations.tokenMints, 1);
    assert.deepEqual(observations.tokenBody, {
      repositories: ["project"],
      permissions: { checks: "read", contents: "read", statuses: "read" },
    });
    assert.ok(observations.apiAuthorizations.length >= 7);
    assert.ok(observations.apiAuthorizations.every((value) => value === "Bearer installation-token-sentinel"));
    assert.equal(observations.rawRequests, 0);
  } finally {
    restoreCaches();
    restore();
  }
});

test("verification fails before network access when the GitHub App broker is unconfigured", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response("unexpected"); };
  try {
    await assert.rejects(loadCommitVerificationEvidence({
      repository: "Example/project",
      baseSha: BASE,
      headSha: HEAD,
      paths: [],
    }, {}), { code: "GITHUB_APP_NOT_CONFIGURED" });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("verification rejects private, redirected, or recreated repository metadata", async (t) => {
  for (const [name, metadata] of [
    ["private", { private: true, visibility: "private" }],
    ["redirected", { full_name: "Example/replacement" }],
    ["recreated identity", { id: 777777 }],
  ]) {
    await t.test(name, async () => {
      const { restore } = installVerificationFetch({ metadata });
      try {
        await assert.rejects(loadCommitVerificationEvidence({ repository: "Example/project", baseSha: BASE, headSha: HEAD }, appEnv()), { code: "GITHUB_APP_SCOPE_INVALID" });
      } finally {
        restore();
      }
    });
  }
});

test("verification rejects mismatched, unsupported, or oversized Contents API objects", async (t) => {
  const valid = {
    type: "file",
    path: "README.md",
    sha: "readme-sha",
    size: Buffer.byteLength(CONTENT),
    encoding: "base64",
    content: Buffer.from(CONTENT).toString("base64"),
  };
  for (const [name, contentPayload] of [
    ["blob mismatch", { ...valid, sha: "different-blob" }],
    ["non-file", { ...valid, type: "dir" }],
    ["unsupported encoding", { ...valid, encoding: "utf-8" }],
    ["oversized declaration", { ...valid, size: 1024 * 1024 + 1 }],
  ]) {
    await t.test(name, async () => {
      const { restore } = installVerificationFetch({ contentPayload });
      try {
        await assert.rejects(loadCommitVerificationEvidence({
          repository: "Example/project",
          baseSha: BASE,
          headSha: HEAD,
          paths: ["README.md"],
        }, appEnv()), { code: "GITHUB_APP_RESPONSE_INVALID" });
      } finally {
        restore();
      }
    });
  }
});

test("rate-limited optional exact-head evidence records a typed observation limitation", async () => {
  const { restore } = installVerificationFetch({
    checksResponse: () => Response.json({ message: "secondary rate limit" }, { status: 429, headers: { "retry-after": "60" } }),
  });
  try {
    const evidence = await loadCommitVerificationEvidence({ repository: "Example/project", baseSha: BASE, headSha: HEAD }, appEnv());
    assert.equal(evidence.checks.available, true);
    assert.equal(evidence.checks.reason, "rate_limited");
  } finally {
    restore();
  }
});
