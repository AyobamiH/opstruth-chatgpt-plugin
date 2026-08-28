import { canonicalJson } from "./canonical.js";
import { loadCommitVerificationEvidence } from "./github.js";
import { pemBytes, sha256, signingMetadata } from "./utils.js";

const HANDOFF_DOMAIN = "donestate.verification-handoff.v2\0";
const REPORT_DOMAIN = "opstruth.donestate-verification-report.v1\0";
const ATTESTATION_DOMAIN = "donestate.verification-attestation.v2\0";
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function encodeBase64(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function without(value, field) {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 500
    && !value.startsWith("/") && !value.includes("\\")
    && value.split("/").every((part) => part && part !== "..");
}

function assertObjectKeys(value, required, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_invalid`);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`${label}_shape_invalid`);
  }
}

function validateRequirementShape(requirement) {
  const base = ["id", "criterionIndex", "kind"];
  const fields = {
    path_exists: ["path"],
    path_absent: ["path"],
    file_contains: ["path", "values"],
    json_equals: ["path", "pointer", "expected"],
    changed_files: ["max", "allowedPaths"],
    github_checks_pass: ["requiredNames"],
  }[requirement?.kind];
  if (!fields) throw new Error("donestate_verification_requirement_kind_unsupported");
  assertObjectKeys(requirement, [...base, ...fields], [...base, ...fields], "donestate_verification_requirement");
  if ("path" in requirement && !safePath(requirement.path)) throw new Error("donestate_verification_path_invalid");
  if (requirement.kind === "file_contains"
    && (!Array.isArray(requirement.values) || requirement.values.length < 1 || requirement.values.length > 20
      || requirement.values.some((value) => typeof value !== "string" || !value || value.length > 2_000))) {
    throw new Error("donestate_file_contains_values_invalid");
  }
  if (requirement.kind === "json_equals"
    && (typeof requirement.pointer !== "string" || requirement.pointer.length > 1_000
      || !/^(?:|\/(?:[^~/]|~[01])*)$/.test(requirement.pointer))) throw new Error("donestate_json_pointer_invalid");
  if (requirement.kind === "changed_files"
    && (!Number.isInteger(requirement.max) || requirement.max < 0 || requirement.max > 300
      || !Array.isArray(requirement.allowedPaths) || requirement.allowedPaths.length < 1 || requirement.allowedPaths.length > 300
      || requirement.allowedPaths.some((path) => !safePath(path)))) throw new Error("donestate_changed_files_requirement_invalid");
  if (requirement.kind === "github_checks_pass"
    && (!Array.isArray(requirement.requiredNames) || requirement.requiredNames.length > 50
      || requirement.requiredNames.some((name) => typeof name !== "string" || !name || name.length > 200))) {
    throw new Error("donestate_github_checks_requirement_invalid");
  }
}

function parseRepositoryRoot(handoff) {
  let url;
  try { url = new URL(handoff.repositoryRoot); } catch { throw new Error("donestate_repository_root_invalid"); }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || parts.length !== 4 || parts[2] !== "tree") {
    throw new Error("donestate_repository_root_invalid");
  }
  const repository = `${parts[0]}/${parts[1]}`;
  if (repository !== handoff.subject.repository || parts[3].toLowerCase() !== handoff.subject.headSha) {
    throw new Error("donestate_repository_subject_mismatch");
  }
}

async function validateHandoff(handoff, now) {
  if (!handoff || handoff.schema !== "donestate.verification-handoff.v2") throw new Error("donestate_handoff_schema_unsupported");
  const handoffFields = [
    "schema", "runId", "generatedAt", "objectiveDigest", "executionSnapshotDigest", "verificationNonce",
    "handoffDigest", "repositoryRoot", "subject", "acceptanceCriteria", "verificationRequirements", "actions", "eventChainHead",
  ];
  assertObjectKeys(handoff, handoffFields, handoffFields, "donestate_handoff");
  const subjectFields = [
    "repository", "baseRef", "baseHeadSha", "branchName", "headSha", "publication", "pullRequestNumber", "pullRequestUrl",
  ];
  assertObjectKeys(handoff.subject, subjectFields, subjectFields, "donestate_subject");
  if (!/^[0-9a-f-]{36}$/.test(handoff.runId) || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(handoff.subject.repository)
    || typeof handoff.subject.baseRef !== "string" || !handoff.subject.baseRef
    || typeof handoff.subject.branchName !== "string" || !handoff.subject.branchName
    || !["branch", "pull_request"].includes(handoff.subject.publication)) throw new Error("donestate_subject_invalid");
  if (!COMMIT.test(handoff.subject?.baseHeadSha || "") || !COMMIT.test(handoff.subject?.headSha || "")) {
    throw new Error("donestate_handoff_commit_invalid");
  }
  for (const field of ["objectiveDigest", "executionSnapshotDigest", "verificationNonce", "handoffDigest", "eventChainHead"]) {
    if (!SHA256.test(handoff[field] || "")) throw new Error(`donestate_handoff_${field}_invalid`);
  }
  if (!Number.isFinite(Date.parse(handoff.generatedAt)) || Date.parse(handoff.generatedAt) > Date.parse(now) + 5 * 60_000) {
    throw new Error("donestate_handoff_time_invalid");
  }
  const expectedDigest = await sha256(`${HANDOFF_DOMAIN}${canonicalJson(without(handoff, "handoffDigest"))}`);
  if (expectedDigest !== handoff.handoffDigest) throw new Error("donestate_handoff_digest_mismatch");
  parseRepositoryRoot(handoff);
  if (!Array.isArray(handoff.acceptanceCriteria) || handoff.acceptanceCriteria.length < 1 || handoff.acceptanceCriteria.length > 20) {
    throw new Error("donestate_acceptance_criteria_invalid");
  }
  if (handoff.acceptanceCriteria.some((criterion) => typeof criterion !== "string" || !criterion || criterion.length > 2_000)) {
    throw new Error("donestate_acceptance_criteria_invalid");
  }
  if (!Array.isArray(handoff.verificationRequirements) || handoff.verificationRequirements.length < 1
    || handoff.verificationRequirements.length > 100) throw new Error("donestate_verification_requirements_missing");
  const ids = new Set();
  const covered = new Set();
  const contentPaths = new Set();
  for (const requirement of handoff.verificationRequirements) {
    validateRequirementShape(requirement);
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(requirement.id || "") || ids.has(requirement.id)) {
      throw new Error("donestate_verification_requirement_id_invalid");
    }
    ids.add(requirement.id);
    if (!Number.isInteger(requirement.criterionIndex) || requirement.criterionIndex < 0
      || requirement.criterionIndex >= handoff.acceptanceCriteria.length) throw new Error("donestate_verification_criterion_binding_invalid");
    covered.add(requirement.criterionIndex);
    if (["file_contains", "json_equals"].includes(requirement.kind)) contentPaths.add(requirement.path);
  }
  if (contentPaths.size > 20) throw new Error("donestate_verification_path_limit_exceeded");
  if (handoff.acceptanceCriteria.some((_criterion, index) => !covered.has(index))) {
    throw new Error("donestate_acceptance_criterion_uncovered");
  }
  if (!Array.isArray(handoff.actions) || !handoff.actions.length) throw new Error("donestate_actions_missing");
  const actionIds = new Set();
  const idempotencyKeys = new Set();
  const actionFields = ["id", "state", "authority", "idempotencyKey", "intentDigest", "resultDigest"];
  for (const action of handoff.actions) {
    assertObjectKeys(action, actionFields, actionFields, "donestate_action");
    if (typeof action.id !== "string" || !action.id || actionIds.has(action.id)
      || typeof action.authority !== "string" || !action.authority
      || typeof action.idempotencyKey !== "string" || !action.idempotencyKey || idempotencyKeys.has(action.idempotencyKey)
      || !["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "AMBIGUOUS"].includes(action.state)
      || (action.intentDigest !== null && !SHA256.test(action.intentDigest))
      || (action.resultDigest !== null && !SHA256.test(action.resultDigest))) throw new Error("donestate_action_invalid");
    actionIds.add(action.id);
    idempotencyKeys.add(action.idempotencyKey);
  }
}

function result(requirement, verdict, explanation, evidenceRefs = [], observed = null) {
  return {
    requirementId: requirement.id,
    criterionIndex: requirement.criterionIndex,
    kind: requirement.kind,
    verdict,
    observed,
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    explanation,
  };
}

function jsonPointer(document, pointer) {
  if (pointer === "") return { found: true, value: document };
  let value = document;
  for (const token of pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, token)) return { found: false, value: null };
    value = value[token];
  }
  return { found: true, value };
}

function evaluateRequirement(requirement, evidence) {
  const commitRef = evidence.subject.commitUrl;
  const treePaths = new Set(evidence.tree.paths);
  const file = evidence.files.find((candidate) => candidate.path === requirement.path);
  if (requirement.kind === "path_exists") {
    if (!evidence.tree.available) return result(requirement, "UNPROVEN", "The exact commit tree was unavailable.", [commitRef]);
    return treePaths.has(requirement.path)
      ? result(requirement, "VERIFIED", "The path exists at the exact commit.", [commitRef], true)
      : result(requirement, "CONTRADICTED", "The path does not exist at the exact commit.", [commitRef], false);
  }
  if (requirement.kind === "path_absent") {
    if (!evidence.tree.complete) return result(requirement, "UNPROVEN", "A complete exact-commit tree is required to prove absence.", [commitRef]);
    return !treePaths.has(requirement.path)
      ? result(requirement, "VERIFIED", "The path is absent from the exact commit.", [commitRef], false)
      : result(requirement, "CONTRADICTED", "The path exists at the exact commit.", [commitRef], true);
  }
  if (requirement.kind === "file_contains") {
    if (!treePaths.has(requirement.path)) return result(requirement, "CONTRADICTED", "The required file is absent.", [commitRef]);
    if (!file) return result(requirement, "UNPROVEN", "The bounded verifier could not read the required file.", [commitRef]);
    const missing = requirement.values.filter((value) => !file.text.includes(value));
    return missing.length
      ? result(requirement, "CONTRADICTED", "The file is missing one or more sealed content values.", [commitRef], { missingCount: missing.length })
      : result(requirement, "VERIFIED", "The exact-commit file contains every sealed value.", [commitRef], { matchedCount: requirement.values.length });
  }
  if (requirement.kind === "json_equals") {
    if (!treePaths.has(requirement.path)) return result(requirement, "CONTRADICTED", "The required JSON file is absent.", [commitRef]);
    if (!file) return result(requirement, "UNPROVEN", "The bounded verifier could not read the required JSON file.", [commitRef]);
    let document;
    try { document = JSON.parse(file.text); } catch { return result(requirement, "CONTRADICTED", "The required file is not valid JSON.", [commitRef]); }
    const observed = jsonPointer(document, requirement.pointer);
    if (!observed.found) return result(requirement, "CONTRADICTED", "The sealed JSON pointer does not exist.", [commitRef]);
    return canonicalJson(observed.value) === canonicalJson(requirement.expected)
      ? result(requirement, "VERIFIED", "The exact-commit JSON value matches the sealed expectation.", [commitRef], observed.value)
      : result(requirement, "CONTRADICTED", "The exact-commit JSON value differs from the sealed expectation.", [commitRef], observed.value);
  }
  if (requirement.kind === "changed_files") {
    const ref = evidence.compare.htmlUrl;
    if (!evidence.compare.available || !evidence.compare.complete) return result(requirement, "UNPROVEN", "A complete GitHub comparison was unavailable.", [ref]);
    if (!(["ahead", "identical"].includes(evidence.compare.status)) || evidence.compare.behindBy !== 0) {
      return result(requirement, "CONTRADICTED", "The head commit is not a clean descendant of the sealed base.", [ref], evidence.compare.status);
    }
    const changed = evidence.compare.files.map((item) => item.path);
    const disallowed = changed.filter((path) => !requirement.allowedPaths.includes(path));
    return changed.length <= requirement.max && disallowed.length === 0
      ? result(requirement, "VERIFIED", "The exact comparison stays inside the sealed file boundary.", [ref], { changedFiles: changed.length })
      : result(requirement, "CONTRADICTED", "The exact comparison exceeds the sealed file boundary.", [ref], { changedFiles: changed.length, disallowed });
  }
  if (requirement.kind === "github_checks_pass") {
    const available = [
      ...evidence.checks.checkRuns.map((item) => ({ name: item.name, state: item.status === "completed" ? item.conclusion : item.status, ref: item.htmlUrl })),
      ...evidence.checks.contexts.map((item) => ({ name: item.name, state: item.state, ref: item.targetUrl })),
    ];
    const selected = requirement.requiredNames.length
      ? requirement.requiredNames.map((name) => available.find((item) => item.name === name) || { name, state: "missing", ref: null })
      : available;
    const refs = selected.map((item) => item.ref).filter(Boolean);
    if (!evidence.checks.available || !selected.length || selected.some((item) => ["missing", "queued", "in_progress", "pending", null].includes(item.state))) {
      return result(requirement, "UNPROVEN", "One or more sealed GitHub checks are unavailable or incomplete.", refs, selected.map(({ name, state }) => ({ name, state })));
    }
    const failed = selected.filter((item) => !["success", "neutral", "skipped"].includes(item.state));
    return failed.length
      ? result(requirement, "CONTRADICTED", "One or more sealed GitHub checks did not pass.", refs, failed.map(({ name, state }) => ({ name, state })))
      : result(requirement, "VERIFIED", "Every sealed GitHub check passed for the exact commit.", refs, selected.map(({ name, state }) => ({ name, state })));
  }
  return result(requirement, "UNPROVEN", "The verification requirement kind is unsupported.", [commitRef]);
}

function actionFailures(actions) {
  return actions.filter((action) => action.state !== "SUCCEEDED").map((action) => ({ id: action.id, state: action.state }));
}

export async function verifyDoneStateHandoff(handoff, env = {}, ctx = {}, options = {}) {
  const observedAt = new Date(options.observedAt || Date.now()).toISOString();
  await validateHandoff(handoff, observedAt);
  const contentPaths = handoff.verificationRequirements
    .filter((requirement) => ["file_contains", "json_equals"].includes(requirement.kind))
    .map((requirement) => requirement.path);
  const evidence = await loadCommitVerificationEvidence({
    repository: handoff.subject.repository,
    baseSha: handoff.subject.baseHeadSha,
    headSha: handoff.subject.headSha,
    paths: contentPaths,
  }, env, ctx);
  const subjectErrors = [];
  if (!evidence.subject.commitAvailable) subjectErrors.push("exact_commit_unavailable");
  else if (evidence.subject.observedHeadSha !== handoff.subject.headSha) subjectErrors.push("exact_commit_mismatch");
  const requirements = handoff.verificationRequirements.map((requirement) => evaluateRequirement(requirement, evidence));
  const incompleteActions = actionFailures(handoff.actions);
  const contradicted = subjectErrors.includes("exact_commit_mismatch") || requirements.some((item) => item.verdict === "CONTRADICTED")
    || incompleteActions.some((item) => ["FAILED", "AMBIGUOUS"].includes(item.state));
  const verified = !subjectErrors.length && !incompleteActions.length
    && requirements.length > 0 && requirements.every((item) => item.verdict === "VERIFIED");
  const decision = contradicted ? "failed" : verified ? "verified" : "uncertain";
  const evidenceRefs = [...new Set([
    evidence.subject.commitUrl,
    evidence.compare.htmlUrl,
    ...requirements.flatMap((item) => item.evidenceRefs),
  ].filter((item) => typeof item === "string" && item.startsWith("https://")))].sort();
  const report = {
    schema: "opstruth.donestate-verification-report.v1",
    runId: handoff.runId,
    handoffDigest: handoff.handoffDigest,
    verificationNonce: handoff.verificationNonce,
    observedAt,
    subject: {
      repository: evidence.repository.fullName,
      providerRepositoryId: evidence.repository.providerRepositoryId,
      baseHeadSha: handoff.subject.baseHeadSha,
      expectedHeadSha: handoff.subject.headSha,
      observedHeadSha: evidence.subject.observedHeadSha,
    },
    decision,
    requirementResults: requirements,
    subjectErrors,
    incompleteActions,
    evidenceRefs,
    changedState: false,
  };
  const verificationReportDigest = await sha256(`${REPORT_DOMAIN}${canonicalJson(report)}`);
  const metadata = await signingMetadata(env);
  if (!metadata.configured) throw new Error("opstruth_signing_identity_required");
  const unsigned = {
    schema: "donestate.verification-attestation.v2",
    runId: handoff.runId,
    executionSnapshotDigest: handoff.executionSnapshotDigest,
    verificationNonce: handoff.verificationNonce,
    handoffDigest: handoff.handoffDigest,
    verificationReportDigest,
    decision,
    issuedBy: "urn:opstruth:service:public-verifier",
    issuedAt: observedAt,
    evidenceRefs,
  };
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env.OPSTRUTH_RECEIPT_PRIVATE_KEY_PKCS8, "PRIVATE KEY"),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    key,
    new TextEncoder().encode(`${ATTESTATION_DOMAIN}${canonicalJson(unsigned)}`),
  );
  const attestation = {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      publicKeyPem: metadata.publicKeyPem,
      signerFingerprint: metadata.signerFingerprint.slice("sha256:".length),
      signatureBase64: encodeBase64(signature),
    },
  };
  return { report, attestation };
}
