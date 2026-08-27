import actionRequestSchema from "../contracts/action-request.schema.json" with { type: "json" };
import actionAuthorizationSchema from "../contracts/action-authorization.schema.json" with { type: "json" };
import executionReceiptSchema from "../contracts/execution-receipt.schema.json" with { type: "json" };
import verificationResultSchema from "../contracts/verification-result.schema.json" with { type: "json" };
import evidenceGraphSchema from "../schemas/evidence-graph.schema.json" with { type: "json" };
import evidenceDeltaSchema from "../schemas/evidence-delta.schema.json" with { type: "json" };

const SCHEMAS = new Map([
  ["opstruth.action-request", actionRequestSchema],
  ["opstruth.action-authorization", actionAuthorizationSchema],
  ["opstruth.execution-receipt", executionReceiptSchema],
  ["opstruth.verification-result", verificationResultSchema],
  ["opstruth.evidence-graph", evidenceGraphSchema],
  ["opstruth.evidence-delta", evidenceDeltaSchema],
]);

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) throw new Error("external_schema_reference_prohibited");
  return ref.slice(2).split("/").reduce((value, part) => value?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

export function validateJsonSchema(value, schema, rootSchema = schema, path = "$") {
  const errors = [];
  if (schema === true) return errors;
  if (schema === false) return [`${path}:prohibited`];
  if (schema.$ref) return validateJsonSchema(value, resolveRef(rootSchema, schema.$ref), rootSchema, path);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validateJsonSchema(value, candidate, rootSchema, path).length === 0).length;
    return matches === 1 ? [] : [`${path}:one_of_mismatch`];
  }
  if (schema.allOf) for (const candidate of schema.allOf) errors.push(...validateJsonSchema(value, candidate, rootSchema, path));
  if (schema.if) {
    const branch = validateJsonSchema(value, schema.if, rootSchema, path).length === 0 ? schema.then : schema.else;
    if (branch) errors.push(...validateJsonSchema(value, branch, rootSchema, path));
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${path}:const_mismatch`);
  if (schema.enum && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) errors.push(`${path}:enum_mismatch`);
  const acceptedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (acceptedTypes.length && !acceptedTypes.some((type) => typeMatches(value, type))) return [...errors, `${path}:type_mismatch`];
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}:min_length`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}:max_length`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}:pattern_mismatch`);
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}:date_time_invalid`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}:minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}:maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}:min_items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}:max_items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}:duplicate_items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items, rootSchema, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}:required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}.${key}:unknown`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(value[key], child, rootSchema, `${path}.${key}`));
    }
  }
  return errors;
}

export function validateKnownDocument(document) {
  const schema = SCHEMAS.get(document?.schema);
  if (!schema) return ["$:schema_unknown"];
  return validateJsonSchema(document, schema);
}

export function knownSchema(schema) {
  return SCHEMAS.get(schema) || null;
}

