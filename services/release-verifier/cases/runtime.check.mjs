import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { recoveryFixture } from "./fixtures.mjs";

test("actual Workers RPC verifies old evidence through a named binding while public recovery stays absent",async()=>{
  const f=await recoveryFixture(),requests=[];
  const bundled=await build({entryPoints:[fileURLToPath(new URL("../src/entrypoint.mjs",import.meta.url))],
    bundle:true,write:false,format:"esm",platform:"neutral",target:"es2022",
    conditions:["workerd","worker","browser"],external:["cloudflare:workers","node:*"]});
  const outbound=async request=>{
    assert.equal(request.method,"GET");requests.push(request.url);
    const url=new URL(request.url),base="/repos/AyobamiH/agentproof-release-canary";
    if(url.hostname==="api.github.com"&&url.pathname===base)
      return Response.json({id:f.subject.repositoryId,name:f.subject.repository,private:false,
        owner:{id:f.subject.ownerId,login:f.subject.owner}});
    if(url.hostname==="api.github.com"&&url.pathname===base+"/git/ref/tags/"+f.subject.tagName)
      return Response.json({ref:"refs/tags/"+f.subject.tagName,
        object:{type:"commit",sha:f.subject.tagCommit}});
    const download="https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+
      f.subject.tagName+"/";
    if(url.hostname==="api.github.com"&&url.pathname===base+"/releases/"+f.subject.releaseId)
      return Response.json({id:f.subject.releaseId,tag_name:f.subject.tagName,draft:false,prerelease:true,
        published_at:f.receipt.payload.after.publishedAt,assets:[
          {id:f.subject.packageAssetId,name:f.subject.packageAssetName,state:"uploaded",
            digest:f.subject.packageDigest,browser_download_url:download+f.subject.packageAssetName},
          {id:f.subject.provenanceAssetId,name:"provenance.json",state:"uploaded",
            digest:f.subject.provenanceDigest,browser_download_url:download+"provenance.json"}]});
    if(request.url===download+f.subject.packageAssetName)
      return new Response(await f.reader.downloadAsset(f.subject.packageAssetId));
    if(request.url===download+"provenance.json")
      return new Response(await f.reader.downloadAsset(f.subject.provenanceAssetId));
    throw Error("unexpected outbound request");
  };
  const mf=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[
    {name:"caller",modules:true,compatibilityDate:"2026-10-17",
      script:"export default {async fetch(request,env){return Response.json(await env.VERIFIER.verify(await request.json()));}};",
      serviceBindings:{VERIFIER:{name:"verifier",entrypoint:"ReleaseRecovery"}}},
    {name:"verifier",modules:true,compatibilityDate:"2026-10-17",
      compatibilityFlags:["nodejs_compat"],script:bundled.outputFiles[0].text,
      bindings:f.env,outboundService:outbound},
  ]}));
  try {
    const caller=await mf.getWorker("caller"),verifier=await mf.getWorker("verifier");
    const response=await caller.fetch("https://caller.test",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(f.recovery)});
    const result=await response.json();
    assert.equal(result.state,"VERIFIED",JSON.stringify(result));
    assert.equal(result.signed,true);assert.equal(result.report.runId,f.body.runId);
    assert.equal(result.report.receiptPayloadDigest,f.receipt.proof.payloadDigest);
    assert.equal(requests.length,5,"three metadata GETs and two asset downloads");
    const denied=await verifier.fetch("https://verifier.test/v1/recovery",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(f.recovery)});
    assert.equal(denied.status,404);
    const publicVerify=await verifier.fetch("https://verifier.test/v1/verify",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(f.body)});
    assert.equal(publicVerify.status,401);
  } finally {await mf.dispose();}
});
