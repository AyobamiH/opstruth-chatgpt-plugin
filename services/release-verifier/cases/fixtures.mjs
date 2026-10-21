import { generateKeyPairSync, sign as signEd, createHash, randomUUID } from "node:crypto";
import { stableJson, sha256 } from "../../../src/utils.js";
import { HANDOFF_DOMAIN, READBACK_DOMAIN } from "../src/trust.mjs";
import { RELEASE_PROVENANCE_DOMAIN } from "../../../verification-kits/release-v1/verify.js";

const hash = s => createHash("sha256").update(s).digest("hex");
const kp = () => {
  const pair=generateKeyPairSync("ed25519");
  const publicKeyPem=pair.publicKey.export({type:"spki",format:"pem"}).toString();
  const fingerprint="sha256:"+hash(pair.publicKey.export({type:"spki",format:"der"}));
  return {publicKeyPem, fingerprint,
    privateKey:pair.privateKey,
    sign:s=>signEd(null,Buffer.from(s),pair.privateKey).toString("base64")};
};
const ap=kp(),approval=kp(),op=kp(),provenance=kp(),handoffSigner=kp();
const target={
  schema:"opstruth.release-v1.subject.v1",owner:"AyobamiH",repository:"agentproof-release-canary",
  ownerId:47716486,repositoryId:1423718326,releaseId:8001,
  tagName:"v0.0.1-rc.1",tagCommit:"a".repeat(40),
  packageAssetId:8002,packageAssetName:"canary-package.tgz",
  packageDigest:"",provenanceAssetId:8003,provenanceDigest:"",
};
const stamp=Date.now(), githubRunId="3";
async function fixture(at=stamp){
  const blob=new TextEncoder().encode("synthetic package with independently hashed bytes");
  const partial={...target,packageDigest:"sha256:"+await sha256(blob)};
  const {provenanceDigest:_,provenanceAssetId:__ignoreSelfAssetId,...withoutSelfDigest}=partial;
  const unsignedManifest={
    schema:"opstruth.release-v1.provenance.v1",
    subjectDigest:await sha256(stableJson(withoutSelfDigest)),
    packageSha256:await sha256(blob),issuer:"independent-canary-provenance-issuer",
    issuedAt:new Date(at-2500).toISOString(),
  };
  const provenanceAsset=new TextEncoder().encode(JSON.stringify({
    ...unsignedManifest,signature:{
      algorithm:"Ed25519",publicKeyPem:provenance.publicKeyPem,
      signerFingerprint:provenance.fingerprint,
      signatureBase64:provenance.sign(RELEASE_PROVENANCE_DOMAIN+stableJson(unsignedManifest)),
    },
  }));
  const subject={...partial,provenanceDigest:"sha256:"+await sha256(provenanceAsset)};
  const agentSubject={
    schema:"agentproof.release.subject.v1",provider:"github",
    owner:subject.owner,repository:subject.repository,ownerId:subject.ownerId,
    repositoryId:subject.repositoryId,releaseId:subject.releaseId,tagName:subject.tagName,
    tagCommit:subject.tagCommit,packageAssetId:subject.packageAssetId,
    packageAssetName:subject.packageAssetName,packageDigest:subject.packageDigest,
    provenanceAssetId:subject.provenanceAssetId,provenanceDigest:subject.provenanceDigest,
    prerelease:true,makeLatest:false,
  };
  const runId=randomUUID(),transactionId=randomUUID(),nonce="release-canary:"+githubRunId,
    idempotencyKey=nonce,subjectDigest=await sha256(stableJson(agentSubject));
  const decidedAt=new Date(at-40_000).toISOString(),
    expiresAt=new Date(at+250_000).toISOString(),
    attemptedAt=new Date(at-25_000).toISOString(),
    verifiedAt=new Date(at-12_000).toISOString(),
    issuedAt=new Date(at-10_000).toISOString();
  const unsignedApproval={
    schema:"agentproof.release.approval.v1",actionType:"agentproof.release.v1",
    subjectDigest,transactionId,nonce,decision:"approved",environment:"production",
    issuer:"agentproof.release-canary.authority.v1",decidedAt,expiresAt,
    authorityPublicKeyPem:approval.publicKeyPem,
  };
  const signedApproval={...unsignedApproval,
    signatureBase64:approval.sign(stableJson(unsignedApproval))};
  const observation=(draft)=>({
    schema:"agentproof.release.observation.v1",
    ownerId:agentSubject.ownerId,repositoryId:agentSubject.repositoryId,
    releaseId:agentSubject.releaseId,tagName:agentSubject.tagName,
    tagCommit:agentSubject.tagCommit,packageAssetId:agentSubject.packageAssetId,
    packageAssetName:agentSubject.packageAssetName,packageDigest:agentSubject.packageDigest,
    provenanceAssetId:agentSubject.provenanceAssetId,
    provenanceDigest:agentSubject.provenanceDigest,assetCount:2,
    draft,prerelease:true,publishedAt:draft?null:verifiedAt,
  });
  const payload={
    schemaId:"agentproof.signed-receipt.v2",schemaVersion:"2.0.0",
    receiptFormatVersion:"v2",actionType:"agentproof.release.v1",
    receiptId:randomUUID(),issuedAt,transactionId,nonce,idempotencyKey,
    subject:agentSubject,subjectDigest,approval:signedApproval,
    approvalDigest:await sha256(stableJson(signedApproval)),
    intentDigest:await sha256(stableJson({transactionId,idempotencyKey,nonce,subjectDigest})),
    effect:"publish_exact_existing_draft_prerelease",
    attemptedAt,verifiedAt,before:observation(true),after:observation(false),
    verificationState:"verified_provider_readback",independentOutcomeVerified:false,
    compensationState:"not_supported",signerRole:"independent_receipt_signer",
    signingPolicyId:"agentproof.release-canary.receipts.v1",predecessorPayloadDigest:null,
  };
  const receiptInput="agentproof.signed-receipt.v2.release\0"+stableJson(payload);
  const receipt={payload,proof:{
    algorithm:"Ed25519",keyId:payload.signingPolicyId,
    publicKeyPem:ap.publicKeyPem,signerFingerprint:ap.fingerprint,
    payloadDigest:await sha256(receiptInput),signatureBase64:ap.sign(receiptInput),
  }};
  const handoffUnsigned={
    schema:"donestate.release-verification-handoff.v1",
    runId,transactionId,subjectDigest,receiptPayloadDigest:receipt.proof.payloadDigest,
    githubRunId,issuedAt:new Date(stamp-4000).toISOString(),
    expiresAt:new Date(stamp+250_000).toISOString(),issuer:"donestate.release-handoff",
    publicKeyPem:handoffSigner.publicKeyPem,
  };
  const handoff={...handoffUnsigned,
    signatureBase64:handoffSigner.sign(HANDOFF_DOMAIN+stableJson(handoffUnsigned))};
  const reader={
    async observe(){return{
      owner:subject.owner,repository:subject.repository,
      ownerId:subject.ownerId,repositoryId:subject.repositoryId,
      releaseId:subject.releaseId,tagName:subject.tagName,tagCommit:subject.tagCommit,
      prerelease:true,draft:false,publishedAt:verifiedAt,observedAt:new Date(stamp).toISOString(),
      packageAssetId:subject.packageAssetId,packageAssetName:subject.packageAssetName,
      packageDigest:subject.packageDigest,provenanceAssetId:subject.provenanceAssetId,
      provenanceDigest:subject.provenanceDigest,assetCount:2,
    };},
    async downloadAsset(id){return id===subject.packageAssetId?blob:provenanceAsset;},
  };
  const env={
    ROLE:"release-verifier",ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40),
    TARGET_SUBJECT_JSON:JSON.stringify(subject),SIGNER_FINGERPRINT:op.fingerprint,
    SIGNING_PUBLIC_KEY_PEM:op.publicKeyPem,
    SIGNING_PRIVATE_KEY_PEM:op.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
    TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT:ap.fingerprint,
    TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT:approval.fingerprint,
    TRUSTED_DONESTATE_HANDOFF_FINGERPRINT:handoffSigner.fingerprint,
    TRUSTED_PROVENANCE_SIGNER_FINGERPRINT:provenance.fingerprint,
  };
  return{subject,receipt,reader,env,body:{runId,transactionId,receipt,handoff}};
}
async function recoveryFixture(age=2*24*3600_000){
  const f=await fixture(stamp-age),p=f.receipt.payload;
  const request={stateDirectory:"/tmp/agentproof-release-canary-"+githubRunId,
    transactionId:p.transactionId,nonce:p.nonce,idempotencyKey:p.idempotencyKey,
    subject:p.subject,approval:p.approval};
  const unsigned={schema:"agentproof.release-readback-attestation.v1",
    runId:f.body.runId,transactionId:p.transactionId,requestDigest:hash(stableJson(request)),
    subjectDigest:p.subjectDigest,githubRunId,workflowCommit:f.env.TRUSTED_SOURCE_SHA,
    completionDigest:"c".repeat(64),recoveryAuthorisationDigest:"d".repeat(64),
    observedAt:new Date(stamp-1000).toISOString(),expiresAt:new Date(stamp+299_000).toISOString(),
    after:p.after,readOnly:true,authorityPublicKeyPem:approval.publicKeyPem};
  const observation={...unsigned,signatureBase64:approval.sign(READBACK_DOMAIN+stableJson(unsigned))};
  f.env={...f.env,ENABLED:"false",READBACK_RECOVERY_ENABLED:"true",
    READBACK_RECOVERY_RUN_ID:f.body.runId,READBACK_RECOVERY_GITHUB_RUN_ID:githubRunId,
    READBACK_RECOVERY_TRANSACTION_ID:p.transactionId,
    READBACK_RECOVERY_COMPLETION_DIGEST:unsigned.completionDigest,
    READBACK_RECOVERY_AUTHORISATION_DIGEST:unsigned.recoveryAuthorisationDigest};
  return {...f,recovery:{receipt:f.receipt,handoff:f.body.handoff,observation}};
}

export { hash, kp, ap, approval, op, provenance, handoffSigner, target, stamp, githubRunId,
  fixture, recoveryFixture };
