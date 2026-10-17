import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signEd, verify as verifyEd,
  createHash, randomUUID } from "node:crypto";
import { stableJson, sha256 } from "../../../src/utils.js";
import { evaluate, checkReceipt, validateClaims } from "../src/worker.mjs";
import { validateReleaseReceipt, validateRunHandoff, HANDOFF_DOMAIN } from "../src/trust.mjs";
import { PublicReleaseReader } from "../src/github-reader.mjs";
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
async function fixture(){
  const blob=new TextEncoder().encode("synthetic package with independently hashed bytes");
  const partial={...target,packageDigest:"sha256:"+await sha256(blob)};
  const {provenanceDigest:_,provenanceAssetId:__ignoreSelfAssetId,...withoutSelfDigest}=partial;
  const unsignedManifest={
    schema:"opstruth.release-v1.provenance.v1",
    subjectDigest:await sha256(stableJson(withoutSelfDigest)),
    packageSha256:await sha256(blob),issuer:"independent-canary-provenance-issuer",
    issuedAt:new Date(stamp-2500).toISOString(),
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
  const runId=randomUUID(),transactionId=randomUUID(),nonce="canary-nonce-"+randomUUID(),
    idempotencyKey="canary-idempotency-"+randomUUID(),subjectDigest=await sha256(stableJson(agentSubject));
  const decidedAt=new Date(stamp-40_000).toISOString(),
    expiresAt=new Date(stamp+250_000).toISOString(),
    attemptedAt=new Date(stamp-25_000).toISOString(),
    verifiedAt=new Date(stamp-12_000).toISOString(),
    issuedAt=new Date(stamp-10_000).toISOString();
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
      prerelease:true,draft:false,publishedAt:new Date(stamp-2000).toISOString(),
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
const verifyFixture=async(f, body=f.body,run=githubRunId)=>
  evaluate(body,f.env,stamp,()=>f.reader,run);
const resign=(receipt)=>{
  const x=structuredClone(receipt);
  x.payload.approvalDigest=hash(stableJson(x.payload.approval));
  const input="agentproof.signed-receipt.v2.release\0"+stableJson(x.payload);
  x.proof.payloadDigest=hash(input);x.proof.signatureBase64=ap.sign(input);
  return x;
};

test("exact approved release + signed DoneState handoff + independent bytes gives bound verifier decision",async()=>{
  const f=await fixture();
  const result=await verifyFixture(f);
  assert.equal(result.state,"VERIFIED");
  assert.equal(result.signed,true);
  assert.equal(result.report.observation.independentAttestationIssued,false);
  const{signature,...unsigned}=result.report;
  assert.equal(signature.signerFingerprint,op.fingerprint);
  assert(verifyEd(null,Buffer.from("opstruth.release-v1-verification.v1\0"+stableJson(unsigned)),
    op.publicKeyPem,Buffer.from(signature.signatureBase64,"base64")));
  assert.equal(result.report.receiptPayloadDigest,f.receipt.proof.payloadDigest);
  assert.equal(result.report.runId,f.body.runId);
});
test("no signed DoneState handoff means no VERIFIED despite valid receipt and published bytes",async()=>{
  const f=await fixture();
  await assert.rejects(verifyFixture(f,{...f.body,handoff:undefined}),/release_trust:handoff/);
});
test("handoff cannot be replayed for another GitHub workflow run, DoneState run, or receipt",async()=>{
  const f=await fixture();
  await assert.rejects(verifyFixture(f,f.body,"9"),/release_trust:handoff_binding_invalid/);
  await assert.rejects(verifyFixture(f,{...f.body,runId:randomUUID()}),/release_trust:handoff_binding_invalid/);
  const changed={...f.body,handoff:{...f.body.handoff,receiptPayloadDigest:"f".repeat(64)}};
  await assert.rejects(verifyFixture(f,changed),/release_trust:handoff_binding_invalid/);
});
test("handed-off trust must be independent from AgentProof approval and receipt signer",async()=>{
  const f=await fixture();
  f.env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT=ap.fingerprint;
  await assert.rejects(verifyFixture(f),/role_separation_missing/);
});
test("receipt alteration or false approval cannot be rescued by a trusted AgentProof receipt signer",async()=>{
  const f=await fixture();
  const wrongSubject=structuredClone(f.receipt);
  wrongSubject.payload.subject.packageDigest="sha256:"+"f".repeat(64);
  await assert.rejects(checkReceipt(wrongSubject,f.subject,f.env),/release_trust:/);
  const forged=structuredClone(f.receipt);
  forged.proof.signatureBase64=Buffer.alloc(64,4).toString("base64");
  await assert.rejects(checkReceipt(forged,f.subject,f.env),/release_trust:/);
  // The trusted receipt signer itself cannot promote a fabricated approval.
  const fake=structuredClone(f.receipt);
  fake.payload.approval.signatureBase64=Buffer.alloc(64,3).toString("base64");
  await assert.rejects(checkReceipt(resign(fake),f.subject,f.env),/release_trust:approval_signature_invalid/);
  const unauthorized=structuredClone(f.receipt);
  unauthorized.payload.approval.environment="development";
  await assert.rejects(checkReceipt(resign(unauthorized),f.subject,f.env),/release_trust:approval_unbound/);
});
test("absence of current downloaded release bytes never produces an independently signed VERIFICATION",async()=>{
  const f=await fixture();
  f.reader.downloadAsset=async()=>{throw Error("github_access_unavailable");};
  const result=await verifyFixture(f);
  assert.equal(result.state,"UNPROVEN");assert.equal(result.signed,false);
});
test("foreign source SHA, actor, ref or protected workflow are denied",()=>{
  const f={
    ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40),TARGET_SUBJECT_JSON:JSON.stringify(target),
    SIGNER_FINGERPRINT:op.fingerprint,
    TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT:ap.fingerprint,
    TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT:approval.fingerprint,
    TRUSTED_DONESTATE_HANDOFF_FINGERPRINT:handoffSigner.fingerprint,
    TRUSTED_PROVENANCE_SIGNER_FINGERPRINT:provenance.fingerprint,
  };
  const c={
    repository:"AyobamiH/agentproof-release-canary",repository_id:"1423718326",
    repository_owner_id:"47716486",actor_id:"47716486",ref:"refs/heads/main",
    event_name:"workflow_dispatch",runner_environment:"github-hosted",
    workflow_ref:"AyobamiH/agentproof-release-canary/.github/workflows/release-canary.yml@refs/heads/main",
    workflow_sha:"a".repeat(40),sha:"a".repeat(40),
    sub:"repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary",
    run_id:githubRunId,run_attempt:"1",
  };
  assert.deepEqual(validateClaims(c,f),{runId:githubRunId});
  for(const [name,value] of Object.entries({
    sha:"f".repeat(40),repository_id:"8",actor_id:"8",workflow_ref:"other",
    sub:"repo:legacy",event_name:"push",
  }))assert.throws(()=>validateClaims({...c,[name]:value},f),/workload_rejected/);
});
test("all five authority and evidence signer pins must be separate",async()=>{
  const f=await fixture();
  for(const [name,value] of [
    ["TRUSTED_PROVENANCE_SIGNER_FINGERPRINT",f.env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT],
    ["TRUSTED_PROVENANCE_SIGNER_FINGERPRINT",f.env.SIGNER_FINGERPRINT],
    ["TRUSTED_DONESTATE_HANDOFF_FINGERPRINT",f.env.TRUSTED_PROVENANCE_SIGNER_FINGERPRINT],
    ["TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT",f.env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT],
  ]){
    const e={...f.env,[name]:value};
    await assert.rejects(evaluate(f.body,e,stamp,()=>f.reader,githubRunId),
      /role_separation_missing/);
  }
});
test("public read-only adapter performs only GitHub GETs with manual redirects",async t=>{
  const f=await fixture(),urls=[];
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    urls.push([String(url),init.method,init.redirect]);
    assert.equal(init.method,"GET");
    const u=new URL(String(url)),suffix=u.pathname.replace("/repos/AyobamiH/agentproof-release-canary","");
    let j;
    if(suffix==="")j={id:f.subject.repositoryId,name:f.subject.repository,private:false,
      owner:{id:f.subject.ownerId,login:f.subject.owner}};
    else if(suffix==="/git/ref/tags/"+f.subject.tagName)j={
      ref:"refs/tags/"+f.subject.tagName,object:{type:"commit",sha:f.subject.tagCommit}};
    else if(suffix==="/releases/"+f.subject.releaseId)j={
      id:f.subject.releaseId,tag_name:f.subject.tagName,draft:false,prerelease:true,
      published_at:new Date(stamp-1000).toISOString(),
      assets:[
        {id:f.subject.packageAssetId,name:f.subject.packageAssetName,state:"uploaded",
          digest:f.subject.packageDigest,browser_download_url:
            "https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
            f.subject.tagName+"/"+f.subject.packageAssetName},
        {id:f.subject.provenanceAssetId,name:"provenance.json",state:"uploaded",
          digest:f.subject.provenanceDigest,browser_download_url:
            "https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
            f.subject.tagName+"/provenance.json"},
      ],
    };
    else throw Error("unexpected GitHub GET");
    return Response.json(j);
  });
  const reader=new PublicReleaseReader(f.subject);
  const observed=await reader.observe(f.subject);
  assert.equal(observed.repositoryId,1423718326);
  assert(urls.every(x=>x[1]==="GET"&&x[2]==="manual"));
});
