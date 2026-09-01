import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import {
  createGithubAppClient,
  createGithubAppJwt,
  GITHUB_APP_REQUESTED_PERMISSIONS,
  githubAppHealth,
} from "../src/github-app.js";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const REPOSITORY = "Example/project";
const INSTALLATION_TOKEN = "installation-token-sentinel";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function appEnv(overrides = {}) {
  return {
    OPSTRUTH_GITHUB_APP_ID: "123456",
    OPSTRUTH_GITHUB_APP_INSTALLATION_ID: "987654",
    OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY: REPOSITORY,
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID: "424242",
    ...overrides,
  };
}

function tokenResponse(overrides = {}) {
  return {
    token: INSTALLATION_TOKEN,
    expires_at: new Date(NOW + 60 * 60 * 1000).toISOString(),
    permissions: { checks: "read", contents: "read", metadata: "read", statuses: "read" },
    repository_selection: "selected",
    repositories: [{ id: 424242, full_name: REPOSITORY, private: false, visibility: "public" }],
    ...overrides,
  };
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function clientOptions(fetch, extra = {}) {
  return { fetch, now: () => NOW, sleep: async () => {}, ...extra };
}

test("GitHub App JWT is an RS256 credential bounded to ten minutes", async () => {
  for (const type of ["pkcs8", "pkcs1"]) {
    const env = appEnv({
      OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: privateKey.export({ type, format: "pem" }).toString(),
    });
    const jwt = await createGithubAppJwt(env, REPOSITORY, NOW);
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
    assert.deepEqual(JSON.parse(decodeBase64Url(encodedHeader)), { alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    assert.equal(payload.iss, "123456");
    assert.equal(payload.iat, Math.floor(NOW / 1000) - 60);
    assert.equal(payload.exp - payload.iat, 600);
    assert.equal(payload.exp <= Math.floor(NOW / 1000) + 540, true);
    assert.equal(verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeBase64Url(encodedSignature)), true);
  }
});

test("GitHub App health exposes configuration state without identity or secret values", () => {
  const configured = githubAppHealth(appEnv());
  assert.deepEqual(configured, {
    mode: "github_app_installation",
    configured: true,
    scope: "selected_public_repository",
  });
  assert.equal(JSON.stringify(configured).includes("123456"), false);
  assert.equal(JSON.stringify(configured).includes(REPOSITORY), false);
  assert.equal(JSON.stringify(configured).includes("424242"), false);

  const partial = appEnv({ OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: "" });
  assert.equal(githubAppHealth(partial).configured, false);
  const malformed = appEnv({ OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nnot-base64!\n-----END PRIVATE KEY-----" });
  assert.equal(githubAppHealth(malformed).configured, false);
  assert.equal(githubAppHealth({ GITHUB_READ_TOKEN: "legacy-static-token" }).configured, false);
});

test("GitHub App rejects a non-selected repository before token minting", async () => {
  let requests = 0;
  assert.throws(
    () => createGithubAppClient(appEnv(), "Example/another", clientOptions(async () => { requests += 1; })),
    (error) => error.code === "GITHUB_APP_REPOSITORY_NOT_ALLOWED" && !error.message.includes(REPOSITORY),
  );
  assert.equal(requests, 0);
  await assert.rejects(createGithubAppJwt(appEnv(), "Example/another", NOW), { code: "GITHUB_APP_REPOSITORY_NOT_ALLOWED" });
});

test("installation token minting is restricted to the exact repository and read permissions", async () => {
  const requests = [];
  const fetch = async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname === "/app/installations/987654/access_tokens") {
      assert.equal(request.method, "POST");
      assert.match(request.headers.get("authorization"), /^Bearer [^.]+\.[^.]+\.[^.]+$/);
      assert.deepEqual(await request.json(), {
        repositories: ["project"],
        permissions: { checks: "read", contents: "read", statuses: "read" },
      });
      return Response.json(tokenResponse());
    }
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("authorization"), `Bearer ${INSTALLATION_TOKEN}`);
    return Response.json({ full_name: REPOSITORY, private: false, visibility: "public" });
  };
  const client = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(fetch));
  const metadata = await client.json("/repos/Example/project");
  assert.equal(metadata.full_name, REPOSITORY);
  assert.deepEqual(client.authority, { mode: "github_app_installation", scope: "selected_public_repository" });
  assert.equal(requests.length, 2);
  assert.deepEqual(GITHUB_APP_REQUESTED_PERMISSIONS, { checks: "read", contents: "read", statuses: "read" });
});

test("installation token response must be short-lived and least privilege", async (t) => {
  const invalidResponses = [
    ["expired", { expires_at: new Date(NOW - 1).toISOString() }, "GITHUB_APP_TOKEN_INVALID"],
    ["near expiry", { expires_at: new Date(NOW + 15_000).toISOString() }, "GITHUB_APP_TOKEN_INVALID"],
    ["overlong", { expires_at: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() }, "GITHUB_APP_TOKEN_INVALID"],
    ["all repositories", { repository_selection: "all" }, "GITHUB_APP_SCOPE_INVALID"],
    ["wrong repository", { repositories: [{ id: 7, full_name: "Example/another", private: false, visibility: "public" }] }, "GITHUB_APP_SCOPE_INVALID"],
    ["wrong immutable repository ID", { repositories: [{ id: 7, full_name: REPOSITORY, private: false, visibility: "public" }] }, "GITHUB_APP_SCOPE_INVALID"],
    ["missing repository identity", { repositories: [{ full_name: REPOSITORY, private: false, visibility: "public" }] }, "GITHUB_APP_SCOPE_INVALID"],
    ["multiple repositories", { repositories: [
      { id: 424242, full_name: REPOSITORY, private: false, visibility: "public" },
      { id: 7, full_name: "Example/another", private: false, visibility: "public" },
    ] }, "GITHUB_APP_SCOPE_INVALID"],
    ["missing checks", { permissions: { contents: "read", metadata: "read", statuses: "read" } }, "GITHUB_APP_SCOPE_INVALID"],
    ["write permission", { permissions: { checks: "read", contents: "write", metadata: "read", statuses: "read" } }, "GITHUB_APP_SCOPE_INVALID"],
    ["extra permission", { permissions: { actions: "read", checks: "read", contents: "read", metadata: "read", statuses: "read" } }, "GITHUB_APP_SCOPE_INVALID"],
  ];
  for (const [name, overrides, code] of invalidResponses) {
    await t.test(name, async () => {
      const fetch = async (request) => new URL(request.url).pathname.startsWith("/app/installations/")
        ? Response.json(tokenResponse(overrides))
        : Response.json({ ok: true });
      const client = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(fetch));
      await assert.rejects(client.json("/repos/Example/project"), { code });
    });
  }
});

test("GitHub App refreshes once after 401 and never loops on revoked credentials", async () => {
  let tokenMints = 0;
  let evidenceReads = 0;
  const fetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) {
      tokenMints += 1;
      return Response.json(tokenResponse({ token: `${INSTALLATION_TOKEN}-${tokenMints}` }));
    }
    evidenceReads += 1;
    if (evidenceReads === 1) return Response.json({ message: "expired" }, { status: 401 });
    if (evidenceReads === 2) return Response.json({ ok: true });
    return Response.json({ token: `${INSTALLATION_TOKEN}-${tokenMints}` }, { status: 401 });
  };
  const client = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(fetch));
  assert.deepEqual(await client.json("/repos/Example/project"), { ok: true });
  assert.equal(tokenMints, 2);
  assert.equal(evidenceReads, 2);
  await assert.rejects(client.json("/repos/Example/project/commits/head"), { code: "GITHUB_APP_AUTH_FAILED" });
  assert.equal(tokenMints, 2);
  assert.equal(evidenceReads, 3);
});

test("GitHub App replaces a token before its validated expiry window", async () => {
  let currentTime = NOW;
  let tokenMints = 0;
  const fetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) {
      tokenMints += 1;
      return Response.json(tokenResponse({
        token: `${INSTALLATION_TOKEN}-${tokenMints}`,
        expires_at: new Date(currentTime + 60 * 60 * 1000).toISOString(),
      }));
    }
    return Response.json({ ok: true });
  };
  const client = createGithubAppClient(appEnv(), REPOSITORY, {
    fetch,
    now: () => currentTime,
    sleep: async () => {},
  });
  await client.json("/repos/Example/project");
  currentTime += 60 * 60 * 1000 - 20_000;
  await client.json("/repos/Example/project/commits/head");
  assert.equal(tokenMints, 2);
});

test("GitHub App rejects repository identity drift during credential refresh", async () => {
  let tokenMints = 0;
  let evidenceReads = 0;
  const client = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) {
      tokenMints += 1;
      return Response.json(tokenResponse({
        token: `${INSTALLATION_TOKEN}-${tokenMints}`,
        repositories: [{ id: tokenMints === 1 ? 424242 : 777777, full_name: REPOSITORY, private: false, visibility: "public" }],
      }));
    }
    evidenceReads += 1;
    if (evidenceReads === 1) return Response.json({ id: 424242, full_name: REPOSITORY, private: false, visibility: "public" });
    return Response.json({ message: "revoked" }, { status: 401 });
  }));
  const metadata = await client.json("/repos/Example/project");
  client.assertSelectedRepository(metadata);
  await assert.rejects(client.json("/repos/Example/project/commits/head"), { code: "GITHUB_APP_SCOPE_INVALID" });
  assert.equal(tokenMints, 2);
});

test("GitHub App rate-limit handling retries only within fixed attempt and delay bounds", async () => {
  let evidenceReads = 0;
  const delays = [];
  const fetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) return Response.json(tokenResponse());
    evidenceReads += 1;
    if (evidenceReads === 1) return Response.json({ message: "secondary rate limit" }, { status: 403, headers: { "retry-after": "0" } });
    if (evidenceReads === 2) return Response.json({ message: "secondary rate limit" }, { status: 429, headers: { "retry-after": "0" } });
    return Response.json({ ok: true });
  };
  const client = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(fetch, { sleep: async (delay) => delays.push(delay) }));
  assert.deepEqual(await client.json("/repos/Example/project"), { ok: true });
  assert.equal(evidenceReads, 3);
  assert.deepEqual(delays, [0, 0]);

  let resetReads = 0;
  const resetDelays = [];
  const resetClient = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) return Response.json(tokenResponse());
    resetReads += 1;
    if (resetReads === 1) {
      return Response.json({ message: "primary rate limit" }, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW / 1000 + 1) },
      });
    }
    return Response.json({ ok: true });
  }, { sleep: async (delay) => resetDelays.push(delay) }));
  assert.deepEqual(await resetClient.json("/repos/Example/project"), { ok: true });
  assert.equal(resetReads, 2);
  assert.deepEqual(resetDelays, [1_000]);

  let boundedReads = 0;
  const boundedClient = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) return Response.json(tokenResponse());
    boundedReads += 1;
    return Response.json({ message: "rate limit" }, { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "0" } });
  }));
  await assert.rejects(boundedClient.json("/repos/Example/project"), (error) => (
    error.code === "GITHUB_APP_RATE_LIMIT" && error.limitation === "rate_limited" && error.retryAfterSeconds === 0
  ));
  assert.equal(boundedReads, 3);

  let longWindowReads = 0;
  const longWindowClient = createGithubAppClient(appEnv(), REPOSITORY, clientOptions(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) return Response.json(tokenResponse());
    longWindowReads += 1;
    return Response.json({ message: "rate limit" }, { status: 429, headers: { "retry-after": "60" } });
  }));
  await assert.rejects(longWindowClient.json("/repos/Example/project"), { code: "GITHUB_APP_RATE_LIMIT" });
  assert.equal(longWindowReads, 1);
});

test("GitHub App failures never expose private keys, JWTs, tokens, IDs, or provider bodies", async () => {
  const env = appEnv();
  let jwt = "";
  const client = createGithubAppClient(env, REPOSITORY, clientOptions(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/installations/")) {
      jwt = request.headers.get("authorization").slice("Bearer ".length);
      return Response.json(tokenResponse());
    }
    return new Response(`${INSTALLATION_TOKEN} ${jwt} ${env.OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM}`, { status: 500 });
  }));
  let failure;
  try {
    await client.json("/repos/Example/project");
  } catch (error) {
    failure = error;
  }
  const rendered = JSON.stringify({ code: failure?.code, message: failure?.message });
  for (const sentinel of [INSTALLATION_TOKEN, jwt, "123456", "987654", "PRIVATE KEY"]) {
    assert.equal(rendered.includes(sentinel), false);
  }
  assert.equal(failure?.code, "GITHUB_APP_REQUEST_FAILED");
});
