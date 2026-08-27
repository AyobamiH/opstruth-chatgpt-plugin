import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const contractRoot = join(root, "contracts");

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported external reference: ${ref}`);
  return ref.slice(2).split("/").reduce((value, part) => value?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

export function validateAgainstSchema(value, schema, rootSchema = schema, path = "$") {
  const errors = [];
  if (schema === true) return errors;
  if (schema === false) return [`${path}: value is prohibited`];
  if (schema.$ref) return validateAgainstSchema(value, resolveRef(rootSchema, schema.$ref), rootSchema, path);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validateAgainstSchema(value, candidate, rootSchema, path).length === 0).length;
    return matches === 1 ? [] : [`${path}: expected exactly one oneOf match, found ${matches}`];
  }
  if (schema.allOf) {
    for (const candidate of schema.allOf) errors.push(...validateAgainstSchema(value, candidate, rootSchema, path));
  }
  if (schema.if) {
    const conditionMatches = validateAgainstSchema(value, schema.if, rootSchema, path).length === 0;
    const branch = conditionMatches ? schema.then : schema.else;
    if (branch) errors.push(...validateAgainstSchema(value, branch, rootSchema, path));
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${path}: const mismatch`);
  if (schema.enum && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) errors.push(`${path}: enum mismatch`);

  const acceptedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (acceptedTypes.length && !acceptedTypes.some((type) => typeMatches(value, type))) {
    errors.push(`${path}: expected type ${acceptedTypes.join(" or ")}`);
    return errors;
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern mismatch`);
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value)))) {
      errors.push(`${path}: invalid RFC 3339 UTC timestamp`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: duplicate array items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateAgainstSchema(item, schema.items, rootSchema, `${path}[${index}]`)));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required property missing`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}.${key}: unknown property`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) errors.push(...validateAgainstSchema(value[key], child, rootSchema, `${path}.${key}`));
    }
  }
  return errors;
}

async function validateExamples() {
  const examplesRoot = join(contractRoot, "examples");
  const exampleNames = (await readdir(examplesRoot)).filter((name) => name.endsWith(".json")).sort();
  const failures = [];
  const examples = new Map();
  for (const name of exampleNames) {
    const example = JSON.parse(await readFile(join(examplesRoot, name), "utf8"));
    examples.set(example.schema, example);
    const schemaName = `${example.schema.slice("opstruth.".length)}.schema.json`;
    const schema = JSON.parse(await readFile(join(contractRoot, schemaName), "utf8"));
    for (const error of validateAgainstSchema(example, schema)) failures.push(`${name} ${error}`);
  }
  if (exampleNames.length !== 4) failures.push(`expected 4 structural examples, found ${exampleNames.length}`);
  failures.push(...semanticErrors(examples));
  if (failures.length) throw new Error(failures.join("\n"));
  return exampleNames.length;
}

function semanticErrors(examples) {
  const errors = [];
  const request = examples.get("opstruth.action-request");
  const authorization = examples.get("opstruth.action-authorization");
  const receipt = examples.get("opstruth.execution-receipt");
  const result = examples.get("opstruth.verification-result");
  if (![request, authorization, receipt, result].every(Boolean)) return ["complete four-artifact example chain is required"];

  const permitted = new Set(request.permittedOperations);
  const forbidden = new Set(request.forbiddenOperations);
  for (const operation of permitted) if (forbidden.has(operation)) errors.push(`ActionRequest operation is both permitted and forbidden: ${operation}`);
  for (const operation of authorization.grantedOperations) if (!permitted.has(operation)) errors.push(`authorization expands request operation scope: ${operation}`);
  if (!request.approvalRequirement.allowedApproverIds.includes(authorization.approver.id)) errors.push("authorization approver is outside the request allowlist");
  if (authorization.decision === "APPROVED" && authorization.grantedOperations.length === 0) errors.push("approved authorization grants no operations");
  if (authorization.decision === "DENIED" && authorization.grantedOperations.length !== 0) errors.push("denied authorization grants operations");
  if (authorization.requestDigest !== request.digest) errors.push("authorization request digest does not bind ActionRequest");
  if (Date.parse(request.expiresAt) <= Date.parse(request.createdAt)) errors.push("ActionRequest expiry must follow creation");
  if (Date.parse(authorization.expiresAt) <= Date.parse(authorization.issuedAt)) errors.push("authorization expiry must follow issuance");
  if (Date.parse(authorization.expiresAt) > Date.parse(request.expiresAt)) errors.push("authorization expires after ActionRequest");

  if (receipt.requestDigest !== request.digest) errors.push("receipt request digest does not bind ActionRequest");
  if (receipt.authorizationDigest !== authorization.digest) errors.push("receipt authorization digest does not bind ActionAuthorization");
  if (receipt.idempotencyKey !== request.idempotencyKey) errors.push("receipt idempotency key mismatch");
  if (receipt.consumedAuthorizationNonce !== authorization.nonce) errors.push("receipt authorization nonce mismatch");
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) errors.push("receipt completes before it starts");
  const granted = new Set(authorization.grantedOperations);
  for (const operation of receipt.operations) if (!granted.has(operation.type)) errors.push(`receipt operation was not granted: ${operation.type}`);
  const sequences = receipt.operations.map((operation) => operation.sequence);
  if (new Set(sequences).size !== sequences.length) errors.push("receipt operation sequence contains duplicates");
  if (sequences.some((sequence, index) => sequence !== index + 1)) errors.push("receipt operation sequence must be contiguous and ordered from one");

  if (result.requestDigest !== request.digest) errors.push("verification request digest mismatch");
  if (result.authorizationDigest !== authorization.digest) errors.push("verification authorization digest mismatch");
  if (result.receiptDigest !== receipt.digest) errors.push("verification receipt digest mismatch");
  if (result.subject.provider !== request.subject.provider || result.subject.repositoryId !== request.subject.repositoryId) errors.push("verification repository subject mismatch");
  if (result.subject.baselineCommitSha !== request.subject.baselineCommitSha) errors.push("verification baseline commit mismatch");
  if ((result.subject.environment || null) !== (request.subject.environment || null)) errors.push("verification environment mismatch");
  if (Date.parse(result.observedAt) < Date.parse(receipt.completedAt)) errors.push("post-execution verification predates receipt completion");
  const requestedAssertions = new Set(request.requestedOutcome.assertions.map((assertion) => assertion.assertionId));
  const resultAssertions = result.assertionResults.map((assertion) => assertion.assertionId);
  if (new Set(resultAssertions).size !== resultAssertions.length) errors.push("verification contains duplicate assertion results");
  for (const assertionId of requestedAssertions) if (!resultAssertions.includes(assertionId)) errors.push(`verification omits requested assertion: ${assertionId}`);
  for (const assertionId of resultAssertions) if (!requestedAssertions.has(assertionId)) errors.push(`verification adds unknown assertion: ${assertionId}`);
  const assertionVerdicts = result.assertionResults.map((assertion) => assertion.verdict);
  if (result.verdict === "VERIFIED" && (assertionVerdicts.some((verdict) => verdict !== "VERIFIED") || result.notVerified.length)) errors.push("VERIFIED result contains an unsatisfied assertion or proof gap");
  if (result.verdict === "PARTIAL" && (!assertionVerdicts.includes("VERIFIED") || assertionVerdicts.every((verdict) => verdict === "VERIFIED"))) errors.push("PARTIAL result must mix verified and non-verified assertions");
  if (result.verdict === "CONTRADICTED" && !assertionVerdicts.includes("CONTRADICTED")) errors.push("CONTRADICTED result has no contradicted assertion");
  if (result.verdict === "UNPROVEN" && assertionVerdicts.includes("CONTRADICTED")) errors.push("UNPROVEN result contains contradicted evidence");
  if (result.verifier.id === receipt.executor.id) errors.push("verifier and executor identities must be separate");
  if (result.proof.signerFingerprint === receipt.proof.signerFingerprint) errors.push("verifier and executor signing identities must be separate");
  if (receipt.executionState === "SUCCEEDED" && result.verdict === "VERIFIED" && result.assertionResults.some((assertion) => assertion.evidenceNodeIds.length === 0)) {
    errors.push("receipt success cannot produce VERIFIED without independent evidence nodes");
  }
  return errors;
}

if (basename(process.argv[1] || "") === "validate-contracts.mjs") {
  try {
    const count = await validateExamples();
    console.log(`contract validation passed: ${count} structural examples`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
