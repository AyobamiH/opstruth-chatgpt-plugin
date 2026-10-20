import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signEd, verify as verifyEd,
  createHash, randomUUID } from "node:crypto";
import { stableJson, sha256 } from "../../../src/utils.js";
import { evaluate, evaluateRecovery, checkReceipt, validateClaims, handle } from "../src/worker.mjs";
import { validateReleaseReceipt, validateRunHandoff, HANDOFF_DOMAIN, READBACK_DOMAIN } from "../src/trust.mjs";
import { PublicReleaseReader } from "../src/github-reader.mjs";
import { RELEASE_PROVENANCE_DOMAIN } from "../../../verification-kits/release-v1/verify.js";

import { hash, ap, approval, op, provenance, handoffSigner, target, stamp, githubRunId,
  fixture, recoveryFixture } from "./fixtures.mjs";

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

const recoverFixture=f=>evaluateRecovery(f.recovery,f.env,stamp,()=>f.reader);

test("binding-only recovery verifies a days-old receipt using fresh linked evidence and independent bytes",async()=>{
  const f=await recoveryFixture(),before=stableJson(f.receipt),reads=[];
  const observe=f.reader.observe,download=f.reader.downloadAsset;
  f.reader.observe=async()=>{reads.push("metadata");return observe();};
  f.reader.downloadAsset=async id=>{reads.push(id);return download(id);};
  const result=await recoverFixture(f);
  assert.equal(result.state,"VERIFIED");assert.equal(result.signed,true);
  assert.equal(result.report.runId,f.body.runId);
  assert.equal(result.report.receiptPayloadDigest,f.receipt.proof.payloadDigest);
  assert.equal(stableJson(f.receipt),before,"original receipt is immutable");
  assert.deepEqual(reads,["metadata",f.subject.packageAssetId,f.subject.provenanceAssetId]);
  await assert.rejects(evaluate(f.body,{...f.env,ENABLED:"true"},stamp,()=>f.reader,githubRunId),
    /receipt_timeline_invalid/,"public freshness policy remains unchanged");
});

test("recovery rejects forged, stale, drifted and foreign sidecars before any external read",async()=>{
  const mutations=[
    {readOnly:false},{runId:randomUUID()},{transactionId:randomUUID()},{githubRunId:"99"},
    {workflowCommit:"f".repeat(40)},{requestDigest:"f".repeat(64)},
    {completionDigest:"f".repeat(64)},{recoveryAuthorisationDigest:"f".repeat(64)},
    {subjectDigest:"f".repeat(64)},
    {observedAt:new Date(stamp-400_000).toISOString()},
    {expiresAt:new Date(stamp-1).toISOString()},
    {expiresAt:new Date(stamp+600_000).toISOString()},
    {authorityPublicKeyPem:op.publicKeyPem},
    {signatureBase64:Buffer.alloc(64,7).toString("base64")},
  ];
  for(const change of mutations){
    const f=await recoveryFixture();let reads=0;
    f.reader.observe=async()=>{reads++;throw Error("must not read");};
    f.recovery.observation={...f.recovery.observation,...change};
    const result=await recoverFixture(f);
    assert.equal(result.state,"BLOCKED",Object.keys(change)[0]);
    assert.equal(result.signed,false);assert.equal(reads,0);
  }
  const f=await recoveryFixture();
  f.recovery.observation.after={...f.recovery.observation.after,releaseId:999};
  assert.equal((await recoverFixture(f)).reasonCode,"readback_evidence_changed");
});

test("fresh readback cannot rescue a forged historical approval or a stale handoff",async()=>{
  const f=await recoveryFixture();
  f.recovery.receipt=structuredClone(f.receipt);
  f.recovery.receipt.proof.signatureBase64=Buffer.alloc(64,5).toString("base64");
  assert.equal((await recoverFixture(f)).reasonCode,"receipt_signature_invalid");
  const g=await recoveryFixture();
  g.recovery.handoff={...g.recovery.handoff,expiresAt:new Date(stamp-1).toISOString()};
  assert.equal((await recoverFixture(g)).reasonCode,"handoff_expired");
  const h=await recoveryFixture();
  h.recovery.handoff={...h.recovery.handoff,runId:randomUUID()};
  assert.equal((await recoverFixture(h)).reasonCode,"handoff_binding_invalid");
});

test("sidecar and handoff expiry during byte reads prevents a late recovery signature",async t=>{
  let elapsed=0;t.mock.method(performance,"now",()=>elapsed);
  for(const expired of ["observation","handoff"]){
    elapsed=0;const f=await recoveryFixture(),value=f.recovery[expired];
    value.expiresAt=new Date(stamp+1000).toISOString();
    const {signatureBase64,...unsigned}=value;
    value.signatureBase64=(expired==="observation"?approval:handoffSigner).sign(
      (expired==="observation"?READBACK_DOMAIN:HANDOFF_DOMAIN)+stableJson(unsigned));
    const download=f.reader.downloadAsset;
    f.reader.downloadAsset=async id=>{elapsed=2000;return download(id);};
    const result=await recoverFixture(f);
    assert.equal(result.state,"BLOCKED");assert.equal(result.signed,false);
    assert.equal(result.reasonCode,expired==="observation"?"readback_expired":"handoff_expired");
  }
});

test("a recovery observation cannot precede its original verified execution",async()=>{
  const f=await recoveryFixture(0),value=f.recovery.observation;
  const observed=Date.parse(f.receipt.payload.verifiedAt)-1;
  value.observedAt=new Date(observed).toISOString();
  value.expiresAt=new Date(observed+300_000).toISOString();
  const {signatureBase64,...unsigned}=value;
  value.signatureBase64=approval.sign(READBACK_DOMAIN+stableJson(unsigned));
  assert.equal((await recoverFixture(f)).reasonCode,"readback_expired");
});

test("recovery capability needs every immutable predecessor pin and rejects credential inputs",async()=>{
  for(const name of ["READBACK_RECOVERY_ENABLED","READBACK_RECOVERY_RUN_ID",
    "READBACK_RECOVERY_GITHUB_RUN_ID","READBACK_RECOVERY_TRANSACTION_ID",
    "READBACK_RECOVERY_COMPLETION_DIGEST","READBACK_RECOVERY_AUTHORISATION_DIGEST"]){
    const f=await recoveryFixture();delete f.env[name];
    assert.equal((await recoverFixture(f)).state,"BLOCKED",name);
  }
  const f=await recoveryFixture();f.recovery.token="must-never-be-accepted-or-echoed";
  const result=await recoverFixture(f);
  assert.equal(result.reasonCode,"unexpected_recovery_fields");
  assert(!JSON.stringify(result).includes(f.recovery.token));
});

test("outage, changed bytes and the existing provenance age limit cannot create signed recovery success",async()=>{
  const f=await recoveryFixture();
  f.reader.downloadAsset=async()=>{throw Error("provider unavailable with sensitive details");};
  const outage=await recoverFixture(f);
  assert.equal(outage.state,"UNPROVEN");assert.equal(outage.signed,false);
  assert.equal(outage.reasonCode,"provider_read_unavailable");
  assert(!JSON.stringify(outage).includes("sensitive"));
  const g=await recoveryFixture();g.reader.downloadAsset=async()=>new Uint8Array([1,2,3]);
  const changed=await recoverFixture(g);
  assert.equal(changed.state,"CONTRADICTED");assert.equal(changed.signed,false);
  const h=await recoveryFixture(32*24*3600_000);
  const expired=await recoverFixture(h);
  assert.equal(expired.state,"CONTRADICTED");assert.equal(expired.reasonCode,"provenance_time");
  assert.equal(expired.signed,false);
});

test("public worker exposes neither unauthenticated recovery nor an RPC forwarding route",async()=>{
  const f=await recoveryFixture();
  for(const path of ["/v1/recovery","/v1/readback","/verify"]){
    const response=await handle(new Request("https://verifier.test"+path,{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(f.recovery)}),f.env);
    assert.equal(response.status,404);
  }
  const response=await handle(new Request("https://verifier.test/v1/verify",{method:"POST",
    headers:{"content-type":"application/json"},body:JSON.stringify(f.recovery)}),f.env);
  assert.equal(response.status,401);
});

test("metadata response and hanging body reads have a bounded deadline",async()=>{
  const f=await fixture(),keepAlive=setTimeout(()=>{},1000);
  try {
    const headerReader=new PublicReleaseReader(f.subject,{timeoutMs:20,fetcher:async(_url,init)=>{
      assert.equal(init.method,"GET");assert(init.signal instanceof AbortSignal);
      return new Promise((_,reject)=>init.signal.addEventListener("abort",()=>reject(init.signal.reason),{once:true}));
    }});
    await assert.rejects(headerReader.observe(f.subject),/timeout|aborted/i);
    const bodyReader=new PublicReleaseReader(f.subject,{timeoutMs:20,fetcher:async()=>
      new Response(new ReadableStream({start(){}}))});
    await assert.rejects(bodyReader.observe(f.subject),/provider_read_timeout/);
  } finally {clearTimeout(keepAlive);}
});

test("asset redirects share one timeout and cancel a stalled final response body",async()=>{
  const f=await fixture(),signals=[],keepAlive=setTimeout(()=>{},1000);let calls=0;
  const reader=new PublicReleaseReader(f.subject,{timeoutMs:20,fetcher:async(_url,init)=>{
    assert.equal(init.method,"GET");signals.push(init.signal);calls++;
    return calls===1?new Response(null,{status:302,headers:{location:
      "https://release-assets.githubusercontent.com/asset"}}):
      new Response(new ReadableStream({start(){}}));
  }});
  reader.assets.set(f.subject.packageAssetId,
    "https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
    f.subject.tagName+"/"+f.subject.packageAssetName);
  try {
    await assert.rejects(reader.downloadAsset(f.subject.packageAssetId,1024),/provider_read_timeout/);
    assert.equal(calls,2);assert.equal(signals[0],signals[1]);
  } finally {clearTimeout(keepAlive);}
});
