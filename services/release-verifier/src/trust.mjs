import { createPublicKey, verify as verifyEd, createHash } from "node:crypto";
import { sha256, stableJson } from "../../../src/utils.js";

export const RECEIPT_DOMAIN = "agentproof.signed-receipt.v2.release\0";
export const HANDOFF_DOMAIN = "donestate.release-verification-handoff.v1\0";
const HEX64 = /^[0-9a-f]{64}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const UUID = /^[0-9a-f-]{36}$/;
const SUBJECT_KEYS = ["schema","provider","owner","repository","ownerId","repositoryId","releaseId",
  "tagName","tagCommit","packageAssetId","packageAssetName","packageDigest","provenanceAssetId",
  "provenanceDigest","prerelease","makeLatest"];
const OBSERVATION_KEYS = ["schema","ownerId","repositoryId","releaseId","tagName","tagCommit",
  "packageAssetId","packageAssetName","packageDigest","provenanceAssetId","provenanceDigest",
  "assetCount","draft","prerelease","publishedAt"];
const RECEIPT_KEYS = ["schemaId","schemaVersion","receiptFormatVersion","actionType","receiptId",
  "issuedAt","transactionId","nonce","idempotencyKey","subject","subjectDigest","approval",
  "approvalDigest","intentDigest","effect","attemptedAt","verifiedAt","before","after",
  "verificationState","independentOutcomeVerified","compensationState","signerRole",
  "signingPolicyId","predecessorPayloadDigest"];
const APPROVAL_KEYS = ["schema","actionType","subjectDigest","transactionId","nonce","decision",
  "environment","issuer","decidedAt","expiresAt","authorityPublicKeyPem","signatureBase64"];
const PROOF_KEYS = ["algorithm","keyId","publicKeyPem","signerFingerprint","payloadDigest","signatureBase64"];
const HANDOFF_KEYS = ["schema","runId","transactionId","subjectDigest","receiptPayloadDigest",
  "githubRunId","issuedAt","expiresAt","issuer","publicKeyPem","signatureBase64"];

function fail(code){throw new Error("release_trust:"+code);}
function demand(value,code){if(!value)fail(code);}
function exact(value,keys,code){
  demand(value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.getPrototypeOf(value)===Object.prototype&&
    JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()),code);
}
function time(v,code){
  demand(typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v),code);
  const n=Date.parse(v);
  demand(Number.isFinite(n)&&new Date(n).toISOString()===v,code);
  return n;
}
function fingerprint(pem){
  const key=createPublicKey(pem);
  demand(key.asymmetricKeyType==="ed25519","signer_algorithm_invalid");
  return "sha256:"+createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex");
}
function verify(pem,encoded,message,code){
  demand(typeof encoded==="string"&&BASE64.test(encoded)&&
    Buffer.from(encoded,"base64").toString("base64")===encoded,code);
  const key=createPublicKey(pem);
  demand(key.asymmetricKeyType==="ed25519"&&
    verifyEd(null,Buffer.from(message),key,Buffer.from(encoded,"base64")),code);
}
function projectSubject(value){
  const {provider,prerelease,makeLatest,...project}=value;
  return {...project,schema:"opstruth.release-v1.subject.v1"};
}
function observation(value,subject,published){
  exact(value,OBSERVATION_KEYS,"observation_shape");
  demand(value.schema==="agentproof.release.observation.v1"&&
    value.draft===!published&&value.prerelease===true&&value.assetCount===2,"observation_phase");
  for(const k of ["ownerId","repositoryId","releaseId","tagName","tagCommit","packageAssetId",
    "packageAssetName","packageDigest","provenanceAssetId","provenanceDigest"])
    demand(value[k]===subject[k],"observation_subject_mismatch");
  if(published)time(value.publishedAt,"publication_time_invalid");
  else demand(value.publishedAt===null,"draft_publication_time");
}
export async function validateReleaseReceipt(receipt,subject,env,now=Date.now()){
  exact(receipt,["payload","proof"],"receipt_shape");
  const {payload:p,proof}=receipt;
  exact(p,RECEIPT_KEYS,"payload_shape");exact(proof,PROOF_KEYS,"proof_shape");
  exact(p.subject,SUBJECT_KEYS,"subject_shape");
  demand(p.schemaId==="agentproof.signed-receipt.v2"&&p.schemaVersion==="2.0.0"&&
    p.receiptFormatVersion==="v2"&&p.actionType==="agentproof.release.v1"&&
    p.effect==="publish_exact_existing_draft_prerelease"&&
    p.verificationState==="verified_provider_readback"&&
    p.independentOutcomeVerified===false&&p.compensationState==="not_supported"&&
    p.signerRole==="independent_receipt_signer"&&p.predecessorPayloadDigest===null&&
    p.signingPolicyId==="agentproof.release-canary.receipts.v1","receipt_type");
  demand(p.subject.schema==="agentproof.release.subject.v1"&&
    p.subject.provider==="github"&&p.subject.makeLatest===false&&
    p.subject.prerelease===true&&stableJson(projectSubject(p.subject))===stableJson(subject),
    "receipt_subject_mismatch");
  demand(UUID.test(p.transactionId)&&UUID.test(p.receiptId)&&
    typeof p.nonce==="string"&&p.nonce.length>=8&&
    typeof p.idempotencyKey==="string"&&p.idempotencyKey.length>=8&&
    p.subjectDigest===await sha256(stableJson(p.subject))&&
    p.approvalDigest===await sha256(stableJson(p.approval))&&
    p.intentDigest===await sha256(stableJson({transactionId:p.transactionId,
      idempotencyKey:p.idempotencyKey,nonce:p.nonce,subjectDigest:p.subjectDigest})),
    "receipt_binding_invalid");
  observation(p.before,p.subject,false);
  observation(p.after,p.subject,true);
  const issued=time(p.issuedAt,"issue_time_invalid");
  const attempted=time(p.attemptedAt,"attempt_time_invalid");
  const verified=time(p.verifiedAt,"verification_time_invalid");
  demand(attempted<=verified&&verified<=issued&&issued<=now+60_000&&
    now-issued<=20*60_000,"receipt_timeline_invalid");
  exact(p.approval,APPROVAL_KEYS,"approval_shape");
  const a=p.approval;
  demand(a.schema==="agentproof.release.approval.v1"&&a.actionType===p.actionType&&
    a.transactionId===p.transactionId&&a.nonce===p.nonce&&
    a.subjectDigest===p.subjectDigest&&a.environment==="production"&&
    a.decision==="approved"&&a.issuer==="agentproof.release-canary.authority.v1",
    "approval_unbound");
  const decided=time(a.decidedAt,"approval_decided_at_invalid");
  const expiry=time(a.expiresAt,"approval_expires_at_invalid");
  demand(decided<=attempted&&attempted<expiry&&expiry>decided&&expiry-decided<=600_000,
    "approval_time_invalid");
  demand(SHA256.test(env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT)&&
    SHA256.test(env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT)&&
    env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT!==env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT,
    "approval_trust_unconfigured");
  demand(fingerprint(a.authorityPublicKeyPem)===env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT,
    "approval_signer_untrusted");
  const {signatureBase64:approvalSignature,...unsignedApproval}=a;
  verify(a.authorityPublicKeyPem,approvalSignature,stableJson(unsignedApproval),
    "approval_signature_invalid");
  demand(proof.algorithm==="Ed25519"&&proof.keyId===p.signingPolicyId&&
    proof.signerFingerprint===env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT&&
    fingerprint(proof.publicKeyPem)===proof.signerFingerprint,
    "receipt_signer_untrusted");
  const input=RECEIPT_DOMAIN+stableJson(p);
  demand(HEX64.test(proof.payloadDigest)&&proof.payloadDigest===await sha256(input),
    "receipt_payload_digest_invalid");
  verify(proof.publicKeyPem,proof.signatureBase64,input,"receipt_signature_invalid");
  return{subjectDigest:p.subjectDigest,receiptPayloadDigest:proof.payloadDigest,
    transactionId:p.transactionId,verifiedAt:verified};
}
export function validateRunHandoff(handoff,binding,env,now=Date.now()){
  exact(handoff,HANDOFF_KEYS,"handoff_shape");
  demand(handoff.schema==="donestate.release-verification-handoff.v1"&&
    handoff.runId===binding.runId&&handoff.transactionId===binding.transactionId&&
    handoff.receiptPayloadDigest===binding.receiptPayloadDigest&&
    handoff.subjectDigest===binding.subjectDigest&&
    handoff.githubRunId===binding.githubRunId&&
    handoff.issuer==="donestate.release-handoff",
    "handoff_binding_invalid");
  const issued=time(handoff.issuedAt,"handoff_time_invalid");
  const expiry=time(handoff.expiresAt,"handoff_time_invalid");
  demand(expiry>issued&&expiry-issued<=600_000&&issued<=now+60_000&&
    expiry>now,"handoff_expired");
  demand(SHA256.test(env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT)&&
    fingerprint(handoff.publicKeyPem)===env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT&&
    ![env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT,
      env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT,env.SIGNER_FINGERPRINT].includes(
        env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT),
    "handoff_signer_untrusted");
  const {signatureBase64,...unsigned}=handoff;
  verify(handoff.publicKeyPem,signatureBase64,HANDOFF_DOMAIN+stableJson(unsigned),
    "handoff_signature_invalid");
}
