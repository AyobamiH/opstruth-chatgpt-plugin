import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDigest, canonicalJson } from "../src/canonical.js";

test("RFC 8785 canonical JSON orders keys and uses ECMAScript number serialization", async () => {
  const value = {
    numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0],
    string: "€$\u000f\nA'B\"\\\"/",
    literals: [null, true, false],
  };
  const canonical = canonicalJson(value);
  assert.equal(canonical, "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27,0],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\"/\"}");
  assert.equal(await canonicalDigest("example.v1\0", value), await canonicalDigest("example.v1\0", JSON.parse(canonical)));
});

test("canonical JSON fails closed for non-JSON values and cycles", () => {
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non_finite/);
  assert.throws(() => canonicalJson({ value: undefined }), /unsupported/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cycle/);
  assert.throws(() => canonicalJson({ value: "\ud800" }), /invalid_unicode/);
  assert.throws(() => canonicalJson({ ["\udc00"]: true }), /invalid_unicode/);
  assert.throws(() => canonicalJson({ value: new Date() }), /non_plain_object/);
});
