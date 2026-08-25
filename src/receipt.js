import { OPSTRUTH_RECEIPT_DOMAIN, pemBytes, sha256, stableJson } from "./utils.js";

const RECEIPT_DOMAIN = "agentproof.signed-receipt.v2\0";
const HEX = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function publicKeyDer(pem) {
  const body = String(pem || "").replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("public_key_invalid");
  return decodeBase64(body);
}

function structureErrors(document) {
  const errors = [];
  if (!document || typeof document !== "object") return ["receipt_document_required"];
  if (!document.payload || typeof document.payload !== "object") errors.push("payload_required");
  if (!document.proof || typeof document.proof !== "object") errors.push("proof_required");
  const payload = document.payload || {};
  const proof = document.proof || {};
  if (payload.schemaId !== "agentproof.signed-receipt.v2") errors.push("unsupported_schema");
  if (payload.schemaVersion !== "2.0.0" || payload.receiptFormatVersion !== "v2") errors.push("unsupported_version");
  if (payload.actionType !== "agentproof.repository_patch.v1") errors.push("unsupported_action_type");
  if (proof.algorithm !== "Ed25519") errors.push("unsupported_signature_algorithm");
  if (!HEX.test(String(proof.payloadDigest || ""))) errors.push("payload_digest_invalid");
  if (!FINGERPRINT.test(String(proof.signerFingerprint || ""))) errors.push("signer_fingerprint_invalid");
  if (typeof proof.publicKeyPem !== "string" || typeof proof.signatureBase64 !== "string") errors.push("proof_material_required");
  return errors;
}

export async function verifyAgentProofReceipt(document, trustedSignerFingerprints = []) {
  const errors = structureErrors(document);
  if (errors.length) {
    return {
      schema: "agentproof.protocol.receipt-verification-result",
      schemaVersion: "2.0.0",
      cryptographicallyValid: false,
      trusted: false,
      signerFingerprint: null,
      reason: "invalid_structure",
      errors,
      warnings: [],
    };
  }
  try {
    const canonical = RECEIPT_DOMAIN + stableJson(document.payload);
    const digest = await sha256(canonical);
    if (digest !== document.proof.payloadDigest) {
      return invalid("digest_mismatch", ["payload_digest_mismatch"], document.proof.signerFingerprint);
    }
    const der = publicKeyDer(document.proof.publicKeyPem);
    const fingerprint = `sha256:${await sha256(der)}`;
    if (fingerprint !== document.proof.signerFingerprint) {
      return invalid("invalid_signature", ["signer_fingerprint_mismatch"], fingerprint);
    }
    const key = await crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      decodeBase64(document.proof.signatureBase64),
      new TextEncoder().encode(canonical),
    );
    if (!valid) return invalid("invalid_signature", ["signature_invalid"], fingerprint);
    const trusted = trustedSignerFingerprints.includes(fingerprint);
    return {
      schema: "agentproof.protocol.receipt-verification-result",
      schemaVersion: "2.0.0",
      cryptographicallyValid: true,
      trusted,
      signerFingerprint: fingerprint,
      reason: trusted ? "trusted" : "valid_untrusted_signer",
      verifiedClaims: {
        receiptId: document.payload.receiptId,
        actionType: document.payload.actionType,
        transactionId: document.payload.transactionId,
        authorityEnvironment: document.payload.authorityEnvironment,
        executionState: document.payload.executionState,
        verificationState: document.payload.verificationState,
        payloadDigest: digest,
      },
      errors: [],
      warnings: trusted ? [] : ["The signature is valid but the signer fingerprint was not supplied as trusted."],
    };
  } catch {
    return invalid("invalid_signature", ["verification_key_or_signature_invalid"], null);
  }
}

function invalid(reason, errors, signerFingerprint) {
  return {
    schema: "agentproof.protocol.receipt-verification-result",
    schemaVersion: "2.0.0",
    cryptographicallyValid: false,
    trusted: false,
    signerFingerprint,
    reason,
    verifiedClaims: null,
    errors,
    warnings: [],
  };
}

export async function verifyOpsTruthEvidenceReceipt(report, trustedSignerFingerprints = []) {
  if (!report || typeof report !== "object" || !report.receipt || typeof report.receipt !== "object") {
    return evidenceInvalid("invalid_structure", ["report_with_receipt_required"], null);
  }
  const receipt = report.receipt;
  if (receipt.schema !== "opstruth.evidence-receipt" || receipt.schemaVersion !== "2.0.0") {
    return evidenceInvalid("invalid_structure", ["unsupported_receipt_schema"], receipt.signerFingerprint || null);
  }
  if (receipt.signed !== true) {
    return {
      schema: "opstruth.evidence-receipt-verification-result",
      schemaVersion: "2.0.0",
      digestValid: false,
      cryptographicallyValid: false,
      trusted: false,
      signerFingerprint: null,
      reason: "unsigned",
      errors: ["receipt_is_not_signed"],
      warnings: [],
    };
  }
  if (receipt.algorithm !== "Ed25519" || !HEX.test(String(receipt.payloadDigest || ""))
    || !FINGERPRINT.test(String(receipt.signerFingerprint || ""))
    || typeof receipt.publicKeyPem !== "string" || typeof receipt.signatureBase64 !== "string") {
    return evidenceInvalid("invalid_structure", ["signed_receipt_fields_invalid"], receipt.signerFingerprint || null);
  }
  try {
    const payload = { ...report };
    delete payload.receipt;
    const canonical = `${OPSTRUTH_RECEIPT_DOMAIN}${stableJson(payload)}`;
    const digest = await sha256(canonical);
    if (digest !== receipt.payloadDigest) {
      return evidenceInvalid("digest_mismatch", ["payload_digest_mismatch"], receipt.signerFingerprint, false);
    }
    const publicDer = pemBytes(receipt.publicKeyPem, "PUBLIC KEY");
    const fingerprint = `sha256:${await sha256(publicDer)}`;
    if (fingerprint !== receipt.signerFingerprint) {
      return evidenceInvalid("invalid_signature", ["signer_fingerprint_mismatch"], fingerprint, true);
    }
    const key = await crypto.subtle.importKey("spki", publicDer, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      decodeBase64(receipt.signatureBase64),
      new TextEncoder().encode(canonical),
    );
    if (!valid) return evidenceInvalid("invalid_signature", ["signature_invalid"], fingerprint, true);
    const trusted = trustedSignerFingerprints.includes(fingerprint);
    return {
      schema: "opstruth.evidence-receipt-verification-result",
      schemaVersion: "2.0.0",
      digestValid: true,
      cryptographicallyValid: true,
      trusted,
      signerFingerprint: fingerprint,
      reason: trusted ? "trusted" : "valid_untrusted_signer",
      errors: [],
      warnings: trusted ? [] : ["The signature is valid but the signer fingerprint was not supplied as trusted."],
    };
  } catch {
    return evidenceInvalid("invalid_signature", ["verification_key_or_signature_invalid"], null, true);
  }
}

function evidenceInvalid(reason, errors, signerFingerprint, digestValid = false) {
  return {
    schema: "opstruth.evidence-receipt-verification-result",
    schemaVersion: "2.0.0",
    digestValid,
    cryptographicallyValid: false,
    trusted: false,
    signerFingerprint,
    reason,
    errors,
    warnings: [],
  };
}
