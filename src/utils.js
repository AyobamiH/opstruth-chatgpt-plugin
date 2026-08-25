const encoder = new TextEncoder();
const OPSTRUTH_RECEIPT_DOMAIN = "opstruth.evidence-receipt.v2\0";

export function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
  return `{${entries.join(",")}}`;
}

export async function sha256(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function bounded(values, limit = 100) {
  return values.slice(0, limit);
}

export function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function textResult(structuredContent, text) {
  return {
    structuredContent,
    content: [{ type: "text", text }],
  };
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pemBytes(value, label) {
  const body = String(value || "")
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("signing_key_invalid");
  return decodeBase64(body);
}

export async function signingMetadata(env = {}) {
  const privateKeyPem = env?.OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8;
  const publicKeyPem = env?.OPSTRUTH_RECEIPT_PUBLIC_KEY_SPKI;
  if (!privateKeyPem || !publicKeyPem) {
    return { configured: false, status: "not_configured", algorithm: "Ed25519", signerFingerprint: null, publicKeyPem: null };
  }
  try {
    const publicDer = pemBytes(publicKeyPem, "PUBLIC KEY");
    await crypto.subtle.importKey("pkcs8", pemBytes(privateKeyPem, "PRIVATE KEY"), { name: "Ed25519" }, false, ["sign"]);
    await crypto.subtle.importKey("spki", publicDer, { name: "Ed25519" }, false, ["verify"]);
    return {
      configured: true,
      status: "configured",
      algorithm: "Ed25519",
      signerFingerprint: `sha256:${await sha256(publicDer)}`,
      publicKeyPem: String(publicKeyPem).trim(),
    };
  } catch {
    return { configured: false, status: "invalid_configuration", algorithm: "Ed25519", signerFingerprint: null, publicKeyPem: null };
  }
}

export async function evidenceReceipt(report, env = {}) {
  const payload = { ...report };
  delete payload.receipt;
  const canonical = `${OPSTRUTH_RECEIPT_DOMAIN}${stableJson(payload)}`;
  const digest = await sha256(canonical);
  const metadata = await signingMetadata(env);
  const base = {
    schema: "opstruth.evidence-receipt",
    schemaVersion: "2.0.0",
    digestAlgorithm: "SHA-256",
    payloadDigest: digest,
    changedState: false,
  };
  if (!metadata.configured) return { ...base, signed: false, signingStatus: metadata.status };
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemBytes(env.OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8, "PRIVATE KEY"),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, encoder.encode(canonical));
    return {
      ...base,
      signed: true,
      signingStatus: "signed",
      algorithm: "Ed25519",
      signerFingerprint: metadata.signerFingerprint,
      publicKeyPem: metadata.publicKeyPem,
      signatureBase64: encodeBase64(signature),
    };
  } catch {
    return { ...base, signed: false, signingStatus: "signing_failed" };
  }
}

export { OPSTRUTH_RECEIPT_DOMAIN, pemBytes };

export function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function htmlResponse(value, status = 200) {
  return new Response(value, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
