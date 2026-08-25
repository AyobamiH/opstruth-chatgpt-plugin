const encoder = new TextEncoder();

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

export async function evidenceReceipt(report) {
  const payload = { ...report };
  delete payload.receipt;
  const digest = await sha256(stableJson(payload));
  return {
    schema: "opstruth.evidence-receipt",
    schemaVersion: "1.0.0",
    digestAlgorithm: "SHA-256",
    payloadDigest: digest,
    signed: false,
    changedState: false,
  };
}

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
