import { canonicalBytes, canonicalDigest, sha256Digest, withoutFields } from "./canonical.js";
import { pemBytes, signingMetadata } from "./utils.js";
import { validateKnownDocument } from "./schema-validation.js";

export const PROTOCOL_DOMAINS = Object.freeze({
  "opstruth.action-request": "opstruth.action-request.v1\0",
  "opstruth.action-authorization": "opstruth.action-authorization.v1\0",
  "opstruth.execution-receipt": "opstruth.execution-receipt.v1\0",
  "opstruth.verification-result": "opstruth.verification-result.v1\0",
  "opstruth.evidence-graph": "opstruth.evidence-graph.v1\0",
});

export const CONSTRAINTS_DOMAIN = "opstruth.action-constraints.v1\0";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function artifactPayload(document) {
  return withoutFields(document, ["digest", "proof"]);
}

function artifactDomain(document) {
  const domain = PROTOCOL_DOMAINS[document?.schema];
  if (!domain || document?.schemaVersion !== "1.0.0") throw new Error("unsupported_protocol_artifact");
  return domain;
}

export async function computeArtifactDigest(document) {
  return canonicalDigest(artifactDomain(document), artifactPayload(document));
}

export async function constraintsDigest(constraints) {
  return canonicalDigest(CONSTRAINTS_DOMAIN, constraints);
}

async function proofResult(document, trustedSignerFingerprints) {
  const proof = document?.proof;
  if (!proof) return { signaturePresent: false, signatureValid: null, signerFingerprint: null, trusted: false, proofErrors: ["proof_required"] };
  const proofErrors = [];
  if (proof.algorithm !== "Ed25519") proofErrors.push("algorithm_unsupported");
  if (!DIGEST.test(String(proof.signerFingerprint || ""))) proofErrors.push("signer_fingerprint_invalid");
  if (typeof proof.publicKeyPem !== "string" || typeof proof.signatureBase64 !== "string") proofErrors.push("proof_fields_invalid");
  if (proofErrors.length) return { signaturePresent: true, signatureValid: false, signerFingerprint: proof.signerFingerprint || null, trusted: false, proofErrors };
  try {
    const publicDer = pemBytes(proof.publicKeyPem, "PUBLIC KEY");
    const fingerprint = await sha256Digest(publicDer);
    if (fingerprint !== proof.signerFingerprint) proofErrors.push("signer_fingerprint_mismatch");
    const key = await crypto.subtle.importKey("spki", publicDer, { name: "Ed25519" }, false, ["verify"]);
    const signatureValid = proofErrors.length === 0 && await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      decodeBase64(proof.signatureBase64),
      canonicalBytes(artifactDomain(document), artifactPayload(document)),
    );
    if (!signatureValid && !proofErrors.length) proofErrors.push("signature_invalid");
    return {
      signaturePresent: true,
      signatureValid,
      signerFingerprint: fingerprint,
      trusted: signatureValid && trustedSignerFingerprints.includes(fingerprint),
      proofErrors,
    };
  } catch {
    return { signaturePresent: true, signatureValid: false, signerFingerprint: proof.signerFingerprint || null, trusted: false, proofErrors: ["proof_invalid"] };
  }
}

function temporalErrors(document, now) {
  const errors = [];
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) return ["verification_time_invalid"];
  const maximumClockSkewMs = 5 * 60 * 1000;
  for (const field of ["createdAt", "issuedAt", "startedAt", "completedAt", "observedAt"]) {
    if (document[field] && Date.parse(document[field]) > timestamp + maximumClockSkewMs) errors.push(`${field}_in_future`);
  }
  if (document.createdAt && document.expiresAt && Date.parse(document.expiresAt) <= Date.parse(document.createdAt)) errors.push("expiry_not_after_creation");
  if (document.issuedAt && document.expiresAt && Date.parse(document.expiresAt) <= Date.parse(document.issuedAt)) errors.push("expiry_not_after_issue");
  if (document.expiresAt && Date.parse(document.expiresAt) <= timestamp) errors.push("artifact_expired");
  if (document.startedAt && document.completedAt && Date.parse(document.completedAt) < Date.parse(document.startedAt)) errors.push("completion_precedes_start");
  return errors;
}

export async function verifyProtocolArtifact(document, options = {}) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { structureValid: false, digestValid: false, signaturePresent: false, signatureValid: null, trusted: false, errors: ["artifact_required"] };
  }
  try { artifactDomain(document); } catch { errors.push("unsupported_protocol_artifact"); }
  if (!errors.includes("unsupported_protocol_artifact")) errors.push(...validateKnownDocument(document).map((error) => `schema:${error}`));
  let computedDigest = null;
  if (!DIGEST.test(String(document.digest || ""))) errors.push("digest_invalid");
  if (!errors.includes("unsupported_protocol_artifact")) {
    try {
      computedDigest = await computeArtifactDigest(document);
      if (computedDigest !== document.digest) errors.push("digest_mismatch");
    } catch {
      errors.push("canonicalization_failed");
    }
  }
  errors.push(...temporalErrors(document, options.now || new Date().toISOString()));
  const needsProof = document.schema !== "opstruth.action-request";
  const proof = needsProof
    ? await proofResult(document, options.trustedSignerFingerprints || [])
    : { signaturePresent: false, signatureValid: null, signerFingerprint: null, trusted: false, proofErrors: [] };
  errors.push(...proof.proofErrors);
  return {
    schema: document.schema || null,
    schemaVersion: document.schemaVersion || null,
    structureValid: !errors.some((error) => error.startsWith("schema:") || ["artifact_required", "unsupported_protocol_artifact", "digest_invalid", "canonicalization_failed", "proof_required", "proof_fields_invalid"].includes(error)),
    digestValid: Boolean(computedDigest && computedDigest === document.digest),
    computedDigest,
    signaturePresent: proof.signaturePresent,
    signatureValid: proof.signatureValid,
    signerFingerprint: proof.signerFingerprint,
    trusted: proof.trusted,
    temporalStatus: errors.includes("artifact_expired") ? "expired" : "current",
    errors,
  };
}

export async function signProtocolArtifact(document, env = {}) {
  const payload = artifactPayload(document);
  const digest = await canonicalDigest(artifactDomain(document), payload);
  const metadata = await signingMetadata(env);
  const base = { ...payload, digest };
  if (!metadata.configured) return { ...base, proof: null };
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env.OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8, "PRIVATE KEY"),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, canonicalBytes(artifactDomain(document), payload));
  const signed = {
    ...base,
    proof: {
      algorithm: "Ed25519",
      signerFingerprint: metadata.signerFingerprint,
      publicKeyPem: metadata.publicKeyPem,
      signatureBase64: encodeBase64(signature),
    },
  };
  const schemaErrors = validateKnownDocument(signed);
  if (schemaErrors.length) throw new Error(`signed_artifact_schema_invalid:${schemaErrors.join("|")}`);
  return signed;
}

export async function verifyHandoffChain({ request, authorization, receipt }, options = {}) {
  const fallbackTrust = options.trustedSignerFingerprints || [];
  const trustedAuthorizerFingerprints = options.trustedAuthorizerFingerprints || fallbackTrust;
  const trustedExecutorFingerprints = options.trustedExecutorFingerprints || fallbackTrust;
  const [requestVerification, authorizationVerification, receiptVerification] = await Promise.all([
    verifyProtocolArtifact(request, { ...options, trustedSignerFingerprints: [] }),
    verifyProtocolArtifact(authorization, { ...options, trustedSignerFingerprints: trustedAuthorizerFingerprints }),
    verifyProtocolArtifact(receipt, { ...options, trustedSignerFingerprints: trustedExecutorFingerprints }),
  ]);
  const errors = [];
  if (authorization?.requestDigest !== request?.digest) errors.push("authorization_request_digest_mismatch");
  if (receipt?.requestDigest !== request?.digest) errors.push("receipt_request_digest_mismatch");
  if (receipt?.authorizationDigest !== authorization?.digest) errors.push("receipt_authorization_digest_mismatch");
  if (receipt?.idempotencyKey !== request?.idempotencyKey) errors.push("idempotency_key_mismatch");
  if (receipt?.consumedAuthorizationNonce !== authorization?.nonce) errors.push("authorization_nonce_mismatch");
  if (authorization?.decision !== "APPROVED") errors.push("authorization_not_approved");
  if (!(request?.approvalRequirement?.allowedApproverIds || []).includes(authorization?.approver?.id)) errors.push("authorization_approver_not_allowed");
  if (Date.parse(authorization?.issuedAt || "") < Date.parse(request?.createdAt || "")) errors.push("authorization_predates_request");
  if (Date.parse(authorization?.expiresAt || "") > Date.parse(request?.expiresAt || "")) errors.push("authorization_outlives_request");
  if (Date.parse(receipt?.startedAt || "") < Date.parse(authorization?.issuedAt || "")) errors.push("execution_predates_authorization");
  if (Date.parse(receipt?.startedAt || "") >= Date.parse(authorization?.expiresAt || "")) errors.push("execution_started_after_authorization_expiry");
  if (request?.constraints && authorization?.constraintsDigest !== await constraintsDigest(request.constraints)) errors.push("constraints_digest_mismatch");
  const permitted = new Set(request?.permittedOperations || []);
  const forbidden = new Set(request?.forbiddenOperations || []);
  for (const operation of permitted) if (forbidden.has(operation)) errors.push(`request_operation_conflict:${operation}`);
  const granted = new Set(authorization?.grantedOperations || []);
  for (const operation of granted) if (!permitted.has(operation) || forbidden.has(operation)) errors.push(`authorization_scope_expansion:${operation}`);
  const operations = receipt?.operations || [];
  for (const operation of operations) if (!granted.has(operation.type)) errors.push(`receipt_operation_not_authorized:${operation.type}`);
  if (operations.length > Number(request?.constraints?.maxOperations || 0)) errors.push("receipt_operation_limit_exceeded");
  const durationMs = Date.parse(receipt?.completedAt || "") - Date.parse(receipt?.startedAt || "");
  if (Number.isFinite(durationMs) && durationMs > Number(request?.constraints?.maxDurationSeconds || 0) * 1000) errors.push("receipt_duration_limit_exceeded");
  if (request?.subject?.environment && !(request?.constraints?.allowedEnvironments || []).includes(request.subject.environment)) errors.push("request_environment_not_allowed");
  const operationIds = operations.map((operation) => operation.operationId);
  if (new Set(operationIds).size !== operationIds.length) errors.push("receipt_operation_id_duplicate");
  const sequences = operations.map((operation) => operation.sequence);
  if (sequences.some((sequence, index) => sequence !== index + 1)) errors.push("receipt_sequence_invalid");
  if (receipt?.executionState === "SUCCEEDED" && (!operations.length || operations.some((operation) => operation.state !== "SUCCEEDED"))) errors.push("receipt_success_contains_unsuccessful_operation");
  const requestedAssertionIds = new Set((request?.requestedOutcome?.assertions || []).map((item) => item.assertionId));
  const claimIds = (receipt?.claims || []).map((claim) => claim.assertionId);
  for (const claimId of claimIds) if (!requestedAssertionIds.has(claimId)) errors.push(`receipt_claim_not_requested:${claimId}`);
  if (new Set(claimIds).size !== claimIds.length) errors.push("receipt_claim_duplicate");
  for (const item of request?.requestedOutcome?.assertions || []) {
    if (["exists", "reachable"].includes(item.predicate) && item.expected !== true) errors.push(`assertion_expected_invalid:${item.assertionId}`);
    if (item.predicate === "absent" && item.expected !== false) errors.push(`assertion_expected_invalid:${item.assertionId}`);
    if (item.predicate === "status_in" && (!Array.isArray(item.expected) || !item.expected.length)) errors.push(`assertion_expected_invalid:${item.assertionId}`);
    if (item.predicate === "matches_digest" && !DIGEST.test(String(item.expected || ""))) errors.push(`assertion_expected_invalid:${item.assertionId}`);
    if (["exists", "absent"].includes(item.predicate) && item.target?.field !== "exists") errors.push(`assertion_target_invalid:${item.assertionId}`);
    if (item.predicate === "reachable" && item.target?.field !== "ok") errors.push(`assertion_target_invalid:${item.assertionId}`);
  }
  if (authorizationVerification.signatureValid && receiptVerification.signatureValid
    && authorizationVerification.signerFingerprint === receiptVerification.signerFingerprint) {
    errors.push("authorizer_executor_signing_identity_not_separate");
  }
  const replayStatus = options.consumedNonces instanceof Set
    ? (options.consumedNonces.has(authorization?.nonce) ? "replayed" : "not_observed")
    : "unproven";
  if (replayStatus === "replayed") errors.push("authorization_nonce_replayed");
  errors.push(...requestVerification.errors.map((error) => `request:${error}`));
  errors.push(...authorizationVerification.errors.map((error) => `authorization:${error}`));
  errors.push(...receiptVerification.errors.map((error) => `receipt:${error}`));
  return {
    valid: errors.length === 0,
    replayStatus,
    request: requestVerification,
    authorization: authorizationVerification,
    receipt: receiptVerification,
    errors,
  };
}
