import { verifyDoneStateHandoff } from "./donestate.js";
import { sha256 } from "./utils.js";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_POLICY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const POLICY_KEYS = ["accountSubjectSha256", "repository", "repositoryId", "installationId", "issuedAt", "expiresAt"];

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function response(value, status) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function authorised(request, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) return false;
  const supplied = request.headers.get("authorization") || "";
  if (supplied.length > 140) return false;
  const [expectedDigest, suppliedDigest] = await Promise.all([sha256(`Bearer ${token}`), sha256(supplied)]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) difference |= expectedDigest.charCodeAt(index) ^ suppliedDigest.charCodeAt(index);
  return difference === 0;
}

function policyFrom(env, now) {
  const raw = env.OPSTRUTH_PRIVATE_VERIFICATION_POLICY;
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("invalid_policy");
  const policy = JSON.parse(raw);
  if (!exactKeys(policy, POLICY_KEYS)
    || typeof policy.accountSubjectSha256 !== "string" || !/^[a-f0-9]{64}$/.test(policy.accountSubjectSha256)
    || typeof policy.repository !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(policy.repository)
    || policy.repository.includes("..")
    || typeof policy.repositoryId !== "string" || !/^[1-9][0-9]{0,19}$/.test(policy.repositoryId)
    || typeof policy.installationId !== "string" || !/^[1-9][0-9]{0,19}$/.test(policy.installationId)
    || typeof policy.issuedAt !== "string" || typeof policy.expiresAt !== "string") throw new Error("invalid_policy");
  const issued = Date.parse(policy.issuedAt);
  const expires = Date.parse(policy.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now
    || expires <= issued || expires - issued > MAX_POLICY_LIFETIME_MS) throw new Error("invalid_policy");
  const appId = env.OPSTRUTH_PRIVATE_GITHUB_APP_ID;
  if (typeof appId !== "string" || !/^[1-9][0-9]{0,19}$/.test(appId)
    || appId === String(env.OPSTRUTH_GITHUB_APP_ID || "").replace(/^0+/, "")
    || typeof env.OPSTRUTH_PRIVATE_GITHUB_APP_PRIVATE_KEY_PEM !== "string"
    || !env.OPSTRUTH_PRIVATE_GITHUB_APP_PRIVATE_KEY_PEM) throw new Error("invalid_policy");
  return policy;
}

async function boundedJson(request) {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) throw new Error("invalid_body");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

// This is a server-to-server route, deliberately absent from public MCP tools.
export async function privateVerificationResponse(request, env = {}, ctx = {}, options = {}) {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (!(await authorised(request, env.OPSTRUTH_PRIVATE_BRIDGE_TOKEN))) return response({ error: "unauthorised" }, 401);
  let policy;
  try { policy = policyFrom(env, options.now ?? Date.now()); }
  catch { return response({ error: "private_verification_unavailable" }, 503); }
  let body;
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_body");
    body = await boundedJson(request);
  } catch { return response({ error: "invalid_request" }, 400); }
  if (!exactKeys(body, ["accountSubjectSha256", "handoff"])
    || body.accountSubjectSha256 !== policy.accountSubjectSha256
    || !record(body.handoff) || !record(body.handoff.subject)
    || body.handoff.subject.repository !== policy.repository) return response({ error: "scope_denied" }, 403);
  const privateEnv = {
    OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8: env.OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8,
    OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI: env.OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI,
    OPSTRUTH_GITHUB_APP_ID: env.OPSTRUTH_PRIVATE_GITHUB_APP_ID,
    OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM: env.OPSTRUTH_PRIVATE_GITHUB_APP_PRIVATE_KEY_PEM,
    OPSTRUTH_GITHUB_APP_INSTALLATION_ID: policy.installationId,
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY: policy.repository,
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID: policy.repositoryId,
  };
  try {
    const result = await verifyDoneStateHandoff(body.handoff, privateEnv, ctx, { privateRepository: true });
    if (Date.parse(policy.expiresAt) <= Date.now()) throw new Error("expired_policy");
    return response(result, 200);
  } catch { return response({ error: "private_verification_unavailable" }, 503); }
}
