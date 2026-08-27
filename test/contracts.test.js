import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateAgainstSchema } from "../scripts/validate-contracts.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../contracts/examples/${name}.json`, import.meta.url), "utf8"));
}

async function schema(name) {
  return JSON.parse(await readFile(new URL(`../contracts/${name}.schema.json`, import.meta.url), "utf8"));
}

for (const name of ["action-request", "action-authorization", "execution-receipt", "verification-result"]) {
  test(`${name} structural example conforms to its v1 schema`, async () => {
    assert.deepEqual(validateAgainstSchema(await fixture(name), await schema(name)), []);
  });
}

test("ActionRequest cannot carry approval or credentials", async () => {
  const document = await fixture("action-request");
  document.approval = { granted: true };
  document.token = "secret";
  const errors = validateAgainstSchema(document, await schema("action-request"));
  assert.ok(errors.some((error) => error.includes("approval: unknown property")));
  assert.ok(errors.some((error) => error.includes("token: unknown property")));
});

test("authorization is bound to one request digest and signed decision", async () => {
  const document = await fixture("action-authorization");
  delete document.requestDigest;
  delete document.proof;
  const errors = validateAgainstSchema(document, await schema("action-authorization"));
  assert.ok(errors.some((error) => error.includes("requestDigest: required property missing")));
  assert.ok(errors.some((error) => error.includes("proof: required property missing")));
});

test("denied authorization cannot grant operations", async () => {
  const document = await fixture("action-authorization");
  document.decision = "DENIED";
  const errors = validateAgainstSchema(document, await schema("action-authorization"));
  assert.ok(errors.some((error) => error.includes("more than maxItems")));
});

test("receipt success and verification success use different vocabularies", async () => {
  const receiptSchema = await schema("execution-receipt");
  const resultSchema = await schema("verification-result");
  assert.ok(receiptSchema.properties.executionState.enum.includes("SUCCEEDED"));
  assert.equal(receiptSchema.properties.executionState.enum.includes("VERIFIED"), false);
  assert.ok(resultSchema.$defs.verdict.enum.includes("VERIFIED"));
  assert.equal(resultSchema.$defs.verdict.enum.includes("SUCCEEDED"), false);
});
