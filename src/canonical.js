const encoder = new TextEncoder();

function assertValidUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("canonical_json_invalid_unicode");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("canonical_json_invalid_unicode");
    }
  }
}

function assertJsonValue(value, seen) {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    assertValidUnicode(value);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical_json_non_finite_number");
    return;
  }
  if (typeof value !== "object") throw new TypeError("canonical_json_unsupported_value");
  if (seen.has(value)) throw new TypeError("canonical_json_cycle");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, seen);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("canonical_json_non_plain_object");
    for (const [key, item] of Object.entries(value)) {
      assertValidUnicode(key);
      assertJsonValue(item, seen);
    }
  }
  seen.delete(value);
}

/**
 * JSON Canonicalization Scheme compatible serialization for JSON values.
 * JSON.stringify supplies the ECMAScript primitive serialization required by
 * RFC 8785; object properties are ordered lexicographically by UTF-16 code
 * units and unsupported JSON values fail closed.
 */
export function canonicalJson(value) {
  assertJsonValue(value, new Set());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function canonicalBytes(domain, value) {
  if (typeof domain !== "string" || !domain.endsWith("\0")) throw new TypeError("canonical_domain_separator_invalid");
  return encoder.encode(`${domain}${canonicalJson(value)}`);
}

export async function sha256Digest(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function canonicalDigest(domain, value) {
  return sha256Digest(canonicalBytes(domain, value));
}

export function withoutFields(value, fields) {
  const copy = { ...value };
  for (const field of fields) delete copy[field];
  return copy;
}
