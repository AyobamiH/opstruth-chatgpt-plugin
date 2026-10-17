import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signEd, verify as verifyEd,
  createHash, randomUUID } from "node:crypto";
import { stableJson, sha256 } from "../../../src/utils.js";
import { evaluate, checkReceipt, validateClaims, handle } from "../src/worker.mjs";
import { PublicReleaseReader } from "../src/github-reader.mjs";
import { RELEASE_PROVENANCE_DOMAIN } from "../../../verification-kits/release-v1/verify.js";

const sha = s => createHash("sha256").update(s).digest("hex");
const kp = () => {
  const pair=generateKeyPairSync("ed25519");
  const publicKeyPem=pair.publicKey.export({type:"spki",format:"pem"}).toString();
  const privateKey=pair.privateKey;
  const fingerprint="sha256:"+sha(pair.publicKey.export({type:"spki",format:"der"}));
  return{privateKey,publicKeyPem,fingerprint,sign:s=>signEd(null,Buffer.from(s),privateKey).toString("base64")};
};
const ap=kp(), op=kp(), provenance=kp();
const target={
  schema:"opstruth.release-v1.subject.v1",owner:"AyobamiH",repository:"agentproof-release-canary",
  ownerId:47716486,repositoryId:1423718326,releaseId:8001,
  tagName:"v0.0.1-rc.1",tagCommit:"a".repeat(40),
  packageAssetId:8002,packageAssetName:"canary-package.tgz",
  packageDigest:"",provenanceAssetId:8003,provenanceDigest:"",
};
const stamp=Date.now();
async function fixture() {
  const blob=new TextEncoder().encode("real bytes from fixture with exact digest");
  const partial={...target,packageDigest:"sha256:"+await sha256(blob)};
  const {provenanceDigest:_,provenanceAssetId:__ignoreSelfAssetId,...withoutSelfDigest}=partial;
  const unsigned={schema:"opstruth.release-v1.provenance.v1",
    subjectDigest:await sha256(stableJson(withoutSelfDigest)),
    packageSha256:await sha256(blob),issuer:"independent-canary-provenance-issuer",
    issuedAt:new Date(stamp-2500).toISOString()};
  const provenanceAsset=new TextEncoder().encode(JSON.stringify({...unsigned,signature:{
    algorithm:"Ed25519",publicKeyPem:provenance.publicKeyPem,signerFingerprint:provenance.fingerprint,
    signatureBase64:provenance.sign(RELEASE_PROVENANCE_DOMAIN+stableJson(unsigned))}}));
  const subject={...partial,provenanceDigest:"sha256:"+await sha256(provenanceAsset)};
  const agentSubject={schema:"agentproof.release.subject.v1",provider:"github",
    owner:subject.owner,repository:subject.repository,ownerId:subject.ownerId,
    repositoryId:subject.repositoryId,releaseId:subject.releaseId,tagName:subject.tagName,
    tagCommit:subject.tagCommit,packageAssetId:subject.packageAssetId,
    packageAssetName:subject.packageAssetName,packageDigest:subject.packageDigest,
    provenanceAssetId:subject.provenanceAssetId,provenanceDigest:subject.provenanceDigest,
    prerelease:true,makeLatest:false};
  const payload={schemaId:"agentproof.signed-receipt.v2",schemaVersion:"2.0.0",
    receiptFormatVersion:"v2",actionType:"agentproof.release.v1",
    verificationState:"verified_provider_readback",independentOutcomeVerified:false,
    compensationState:"not_supported",transactionId:randomUUID(),subject:agentSubject,
    subjectDigest:await sha256(stableJson(agentSubject)),before:{draft:true},after:{draft:false}};
  const raw="agentproof.signed-receipt.v2.release\0"+stableJson(payload);
  const receipt={payload,proof:{algorithm:"Ed25519",publicKeyPem:ap.publicKeyPem,
    signerFingerprint:ap.fingerprint,payloadDigest:await sha256(raw),
    signatureBase64:ap.sign(raw)}};
  const reader={
    async observe(){return{owner:subject.owner,repository:subject.repository,
      ownerId:subject.ownerId,repositoryId:subject.repositoryId,releaseId:subject.releaseId,
      tagName:subject.tagName,tagCommit:subject.tagCommit,prerelease:true,draft:false,
      publishedAt:new Date(stamp-1000).toISOString(),packageAssetId:subject.packageAssetId,
      packageAssetName:subject.packageAssetName,packageDigest:subject.packageDigest,
      provenanceAssetId:subject.provenanceAssetId,provenanceDigest:subject.provenanceDigest,
      assetCount:2};},
    async downloadAsset(id){return id===subject.packageAssetId?blob:provenanceAsset;},
  };
  const env={ROLE:"release-verifier",ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40),
    TARGET_SUBJECT_JSON:JSON.stringify(subject),SIGNER_FINGERPRINT:op.fingerprint,
    SIGNING_PUBLIC_KEY_PEM:op.publicKeyPem,
    SIGNING_PRIVATE_KEY_PEM:op.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
    TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT:ap.fingerprint,
    TRUSTED_PROVENANCE_SIGNER_FINGERPRINT:provenance.fingerprint};
  return {subject,receipt,reader,env,body:{runId:randomUUID(),
    transactionId:payload.transactionId,receipt}};
}

test("release verifier performs independent byte and provenance checks then signs bound decision",async()=>{
  const f=await fixture();
  const result=await evaluate(f.body,f.env,stamp,()=>f.reader);
  assert.equal(result.state,"VERIFIED");
  assert.equal(result.signed,true);
  assert.equal(result.report.observation.independentAttestationIssued,false);
  const {signature,...unsigned}=result.report;
  assert.equal(signature.signerFingerprint,op.fingerprint);
  assert(verifyEd(null,Buffer.from("opstruth.release-v1-verification.v1\0"+stableJson(unsigned)),
    op.publicKeyPem,Buffer.from(signature.signatureBase64,"base64")));
  assert.equal(result.report.receiptPayloadDigest,f.receipt.proof.payloadDigest);
});

test("unsigned/altered AgentProof release claim cannot cause independent signer success",async()=>{
  const f=await fixture();
  const clone=structuredClone(f.receipt);
  clone.payload.subject.packageDigest="sha256:"+"f".repeat(64);
  await assert.rejects(checkReceipt(clone,f.subject,f.env));
  const forged=structuredClone(f.receipt);forged.proof.signatureBase64=Buffer.alloc(64,4).toString("base64");
  await assert.rejects(checkReceipt(forged,f.subject,f.env));
});

test("failure to read actual bytes cannot sign a verifier VERIFIED claim",async()=>{
  const f=await fixture();
  f.reader.downloadAsset=async()=>{throw Error("repository_fetch_denied");};
  const result=await evaluate(f.body,f.env,stamp,()=>f.reader);
  assert.equal(result.state,"UNPROVEN");assert.equal(result.signed,false);
});

test("foreign GitHub OIDC workflow/ref/actor or source SHA is denied",()=>{
  const f= {ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40)};
  const c={repository:"AyobamiH/agentproof-release-canary",repository_id:"1423718326",
    repository_owner_id:"47716486",actor_id:"47716486",ref:"refs/heads/main",
    event_name:"workflow_dispatch",runner_environment:"github-hosted",
    workflow_ref:"AyobamiH/agentproof-release-canary/.github/workflows/release-canary.yml@refs/heads/main",
    workflow_sha:"a".repeat(40),sha:"a".repeat(40),
    sub:"repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary",
    run_id:"3",run_attempt:"1"};
  const env={...f,TARGET_SUBJECT_JSON:JSON.stringify(target),SIGNER_FINGERPRINT:op.fingerprint,
    TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT:ap.fingerprint,
    TRUSTED_PROVENANCE_SIGNER_FINGERPRINT:provenance.fingerprint};
  assert.deepEqual(validateClaims(c,env),{runId:"3"});
  for(const [name,value] of Object.entries({sha:"f".repeat(40),
    repository_id:"8",actor_id:"8",workflow_ref:"other"}))
    assert.throws(()=>validateClaims({...c,[name]:value},env),/workload_rejected/);
});

test("independent reader makes only public GETs and refuses unknown redirects",async t=>{
  const f=await fixture(),urls=[];
  t.mock.method(globalThis,"fetch",async (url,init)=>{
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
      assets:[{id:f.subject.packageAssetId,name:f.subject.packageAssetName,state:"uploaded",
        digest:f.subject.packageDigest,browser_download_url:"https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
        f.subject.tagName+"/"+f.subject.packageAssetName},
        {id:f.subject.provenanceAssetId,name:"provenance.json",state:"uploaded",
          digest:f.subject.provenanceDigest,browser_download_url:"https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
        f.subject.tagName+"/provenance.json"}]};
    else throw Error("unexpected GET");
    return Response.json(j);
  });
  const actual=new PublicReleaseReader(f.subject);
  const observed=await actual.observe(f.subject);
  assert.equal(observed.repositoryId,1423718326);
  assert(urls.every(x=>x[1]==="GET"&&x[2]==="manual"));
});
