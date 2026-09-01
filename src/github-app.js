import { PLUGIN_VERSION } from "./version.js";

const GITHUB_API_ORIGIN = "https://api.github.com";
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;
const MAX_INSTALLATION_TOKEN_LENGTH = 4_096;
const MAX_API_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_DELAY_MS = 2_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const MAX_INSTALLATION_TOKEN_LIFETIME_MS = 65 * 60 * 1000;
const REQUESTED_PERMISSIONS = Object.freeze({
  checks: "read",
  contents: "read",
  statuses: "read",
});
const ALLOWED_RESPONSE_PERMISSIONS = new Set(["checks", "contents", "metadata", "statuses"]);

function githubAppError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  for (const [key, value] of Object.entries(details)) error[key] = value;
  return error;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function repositoryName(value) {
  const candidate = text(value).replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(candidate) || candidate.includes("..")) {
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
  const [owner, repo] = candidate.split("/");
  return { owner, repo, fullName: `${owner}/${repo}`, comparison: `${owner}/${repo}`.toLowerCase() };
}

function hasPrivateKeyEnvelope(value) {
  return /-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(value)
    && /-----END (?:RSA )?PRIVATE KEY-----/.test(value);
}

function readConfiguration(env = {}, requestedRepository) {
  const appId = text(env.OPSTRUTH_GITHUB_APP_ID);
  const installationId = text(env.OPSTRUTH_GITHUB_APP_INSTALLATION_ID);
  const privateKeyPem = text(env.OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM);
  const selected = text(env.OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY);
  const selectedRepositoryId = text(env.OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID);
  if (!appId || !installationId || !privateKeyPem || !selected || !selectedRepositoryId) {
    throw githubAppError("GITHUB_APP_NOT_CONFIGURED", "GitHub App verification access is not configured");
  }
  if (!/^\d{1,20}$/.test(appId) || !/^\d{1,20}$/.test(installationId)
    || !/^[1-9]\d{0,19}$/.test(selectedRepositoryId)
    || privateKeyPem.length > 32 * 1024 || !hasPrivateKeyEnvelope(privateKeyPem)) {
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
  const keyBytes = privateKeyBytes(privateKeyPem);
  if (keyBytes.byteLength < 256 || keyBytes[0] !== 0x30) {
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
  const allowedRepository = repositoryName(selected);
  const requested = repositoryName(requestedRepository);
  if (allowedRepository.comparison !== requested.comparison) {
    throw githubAppError("GITHUB_APP_REPOSITORY_NOT_ALLOWED", "GitHub App verification access is not allowed for this repository");
  }
  return { appId, installationId, privateKeyPem, allowedRepository, allowedRepositoryId: selectedRepositoryId };
}

export function githubAppHealth(env = {}) {
  const values = [
    text(env.OPSTRUTH_GITHUB_APP_ID),
    text(env.OPSTRUTH_GITHUB_APP_INSTALLATION_ID),
    text(env.OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM),
    text(env.OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY),
    text(env.OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID),
  ];
  let configured = values.every(Boolean);
  if (configured) {
    try {
      readConfiguration(env, env.OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY);
    } catch {
      configured = false;
    }
  }
  return {
    mode: "github_app_installation",
    configured,
    scope: "selected_public_repository",
  };
}

function bytesFromBase64(value) {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
  try {
    const decoded = atob(compact);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
}

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function derLength(length) {
  if (length < 128) return Uint8Array.of(length);
  const bytes = [];
  for (let value = length; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derValue(tag, value) {
  return concatBytes(Uint8Array.of(tag), derLength(value.byteLength), value);
}

function pkcs1ToPkcs8(pkcs1) {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithm = Uint8Array.of(
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  );
  return derValue(0x30, concatBytes(version, rsaAlgorithm, derValue(0x04, pkcs1)));
}

function privateKeyBytes(pem) {
  const match = pem.match(/-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]*?)-----END \1PRIVATE KEY-----/);
  if (!match || match[0] !== pem) throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  const bytes = bytesFromBase64(match[2]);
  return match[1] ? pkcs1ToPkcs8(bytes) : bytes;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodedJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export async function createGithubAppJwt(env = {}, requestedRepository, nowMs = Date.now()) {
  const configuration = readConfiguration(env, requestedRepository);
  const issuedAt = Math.floor(nowMs / 1000) - 60;
  const protectedHeader = encodedJson({ alg: "RS256", typ: "JWT" });
  const payload = encodedJson({ iat: issuedAt, exp: issuedAt + 600, iss: configuration.appId });
  const signingInput = `${protectedHeader}.${payload}`;
  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBytes(configuration.privateKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error?.code === "GITHUB_APP_CONFIGURATION_INVALID") throw error;
    throw githubAppError("GITHUB_APP_CONFIGURATION_INVALID", "GitHub App verification configuration is invalid");
  }
  try {
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  } catch {
    throw githubAppError("GITHUB_APP_AUTH_FAILED", "GitHub App verification authentication failed");
  }
}

async function readBoundedJson(response, limit, label) {
  if (!response.body) throw githubAppError("GITHUB_APP_RESPONSE_INVALID", `${label} returned an invalid response`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* response contents remain discarded */ }
        throw githubAppError("GITHUB_APP_RESPONSE_INVALID", `${label} exceeded the bounded response limit`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error?.code === "GITHUB_APP_RESPONSE_INVALID") throw error;
    throw githubAppError("GITHUB_APP_RESPONSE_INVALID", `${label} returned an invalid response`);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw githubAppError("GITHUB_APP_RESPONSE_INVALID", `${label} returned invalid JSON`);
  }
}

function retryDelay(response, nowMs) {
  if (response.status !== 429 && response.status !== 403) return null;
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset >= 0) return Math.max(0, reset * 1000 - nowMs);
    return MAX_RATE_LIMIT_DELAY_MS + 1;
  }
  return response.status === 429 ? 1_000 : null;
}

function rateLimitError(delayMs) {
  return githubAppError(
    "GITHUB_APP_RATE_LIMIT",
    "GitHub verification reads are temporarily rate limited",
    { limitation: "rate_limited", retryAfterSeconds: Math.max(0, Math.ceil(delayMs / 1000)) },
  );
}

async function discardResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Provider error bodies are deliberately neither retained nor surfaced.
  }
}

function responseError(response) {
  if (response.status === 404) return githubAppError("GITHUB_APP_NOT_FOUND", "GitHub verification evidence was not found");
  if (response.status === 401) return githubAppError("GITHUB_APP_AUTH_FAILED", "GitHub App verification authentication failed");
  if (response.status === 403) return githubAppError("GITHUB_APP_PERMISSION_DENIED", "GitHub App verification permission was denied");
  return githubAppError("GITHUB_APP_REQUEST_FAILED", `GitHub verification request failed with status ${response.status}`);
}

function validateInstallationToken(payload, nowMs, allowedRepository, allowedRepositoryId) {
  const token = typeof payload?.token === "string" ? payload.token : "";
  const expiresAtMs = typeof payload?.expires_at === "string" ? Date.parse(payload.expires_at) : Number.NaN;
  if (!/^[A-Za-z0-9._-]+$/.test(token) || token.length > MAX_INSTALLATION_TOKEN_LENGTH || !Number.isFinite(expiresAtMs)
    || expiresAtMs - nowMs <= TOKEN_EXPIRY_SKEW_MS
    || expiresAtMs - nowMs > MAX_INSTALLATION_TOKEN_LIFETIME_MS) {
    throw githubAppError("GITHUB_APP_TOKEN_INVALID", "GitHub App returned an invalid installation token");
  }
  if (payload.repository_selection !== "selected" || !payload.permissions || typeof payload.permissions !== "object"
    || Array.isArray(payload.permissions)) {
    throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
  }
  const selectedRepository = Array.isArray(payload.repositories) && payload.repositories.length === 1 ? payload.repositories[0] : null;
  if (!Number.isSafeInteger(selectedRepository?.id) || selectedRepository.id <= 0
    || String(selectedRepository.id) !== allowedRepositoryId
    || typeof selectedRepository.full_name !== "string"
    || selectedRepository.full_name.toLowerCase() !== allowedRepository.comparison
    || selectedRepository.private !== false || selectedRepository.visibility !== "public") {
    throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
  }
  for (const [permission, access] of Object.entries(payload.permissions)) {
    if (!ALLOWED_RESPONSE_PERMISSIONS.has(permission) || access !== "read") {
      throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
    }
  }
  for (const [permission, access] of Object.entries(REQUESTED_PERMISSIONS)) {
    if (payload.permissions[permission] !== access) {
      throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
    }
  }
  if (payload.permissions.metadata !== undefined && payload.permissions.metadata !== "read") {
    throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
  }
  return { token, expiresAtMs, repositoryId: String(selectedRepository.id) };
}

function apiHeaders(authorization) {
  return {
    accept: "application/vnd.github+json",
    authorization,
    "user-agent": `opstruth-chatgpt-plugin/${PLUGIN_VERSION}`,
    "x-github-api-version": "2022-11-28",
  };
}

export function createGithubAppClient(env = {}, requestedRepository, options = {}) {
  const configuration = readConfiguration(env, requestedRepository);
  const fetchImpl = options.fetch || globalThis.fetch;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  if (typeof fetchImpl !== "function") throw githubAppError("GITHUB_APP_REQUEST_FAILED", "GitHub verification fetch is unavailable");
  let installationToken = null;
  let authRefreshUsed = false;
  let observedRepositoryId = null;

  async function boundedFetch(requestFactory) {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(requestFactory());
      } catch {
        throw githubAppError("GITHUB_APP_REQUEST_FAILED", "GitHub verification request could not be completed");
      }
      const delayMs = retryDelay(response, now());
      if (delayMs === null) return response;
      await discardResponse(response);
      if (attempt === MAX_RATE_LIMIT_RETRIES || delayMs > MAX_RATE_LIMIT_DELAY_MS) throw rateLimitError(delayMs);
      await sleep(delayMs);
    }
    throw rateLimitError(MAX_RATE_LIMIT_DELAY_MS);
  }

  async function mintInstallationToken() {
    const jwt = await createGithubAppJwt(env, configuration.allowedRepository.fullName, now());
    const url = `${GITHUB_API_ORIGIN}/app/installations/${configuration.installationId}/access_tokens`;
    const body = JSON.stringify({
      repositories: [configuration.allowedRepository.repo],
      permissions: REQUESTED_PERMISSIONS,
    });
    const response = await boundedFetch(() => new Request(url, {
      method: "POST",
      headers: { ...apiHeaders(`Bearer ${jwt}`), "content-type": "application/json" },
      body,
    }));
    if (!response.ok) {
      await discardResponse(response);
      throw responseError(response);
    }
    const payload = await readBoundedJson(response, MAX_TOKEN_RESPONSE_BYTES, "GitHub App token broker");
    installationToken = validateInstallationToken(
      payload,
      now(),
      configuration.allowedRepository,
      configuration.allowedRepositoryId,
    );
    if (observedRepositoryId && installationToken.repositoryId !== observedRepositoryId) {
      installationToken = null;
      throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
    }
    return installationToken;
  }

  async function validInstallationToken(force = false) {
    if (!force && installationToken && installationToken.expiresAtMs - now() > TOKEN_EXPIRY_SKEW_MS) return installationToken;
    installationToken = null;
    return mintInstallationToken();
  }

  async function json(path, { allowNotFound = false } = {}) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      throw githubAppError("GITHUB_APP_REQUEST_INVALID", "GitHub verification request path is invalid");
    }
    for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
      const current = await validInstallationToken(authAttempt > 0);
      const response = await boundedFetch(() => new Request(`${GITHUB_API_ORIGIN}${path}`, {
        headers: apiHeaders(`Bearer ${current.token}`),
      }));
      if (response.status === 401) {
        await discardResponse(response);
        installationToken = null;
        if (authRefreshUsed) throw responseError(response);
        authRefreshUsed = true;
        continue;
      }
      if (allowNotFound && response.status === 404) {
        await discardResponse(response);
        return null;
      }
      if (!response.ok) {
        await discardResponse(response);
        throw responseError(response);
      }
      return readBoundedJson(response, MAX_API_RESPONSE_BYTES, "GitHub verification API");
    }
    throw githubAppError("GITHUB_APP_AUTH_FAILED", "GitHub App verification authentication failed");
  }

  function assertSelectedRepository(metadata) {
    if (!installationToken || metadata?.private !== false || metadata?.visibility !== "public"
      || typeof metadata?.full_name !== "string"
      || metadata.full_name.toLowerCase() !== configuration.allowedRepository.comparison
      || String(metadata?.id || "") !== configuration.allowedRepositoryId
      || String(metadata?.id || "") !== installationToken.repositoryId) {
      throw githubAppError("GITHUB_APP_SCOPE_INVALID", "GitHub App installation token scope was not least privilege");
    }
    observedRepositoryId = installationToken.repositoryId;
  }

  return {
    json,
    assertSelectedRepository,
    authority: Object.freeze({ mode: "github_app_installation", scope: "selected_public_repository" }),
  };
}

export const GITHUB_APP_REQUESTED_PERMISSIONS = REQUESTED_PERMISSIONS;
