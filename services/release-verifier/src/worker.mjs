import { createRemoteJWKSet, jwtVerify } from "jose";
import { createPrivateKey, createPublicKey, sign as signEd, createHash } from "node:crypto";
import { stableJson } from "../../../src/utils.js";
import { validateReleaseReceipt, validateRunHandoff } from "./trust.mjs";
import { verifyReleaseV1Bytes } from "../../../verification-kits/release-v1/verify.js";
import { PublicReleaseReader } from "./github-reader.mjs";

const ISSUER="https://token.actions.githubusercontent.com";
const JWKS=createRemoteJWKSet(new URL(ISSUER+"/.well-known/jwks"),
  {timeoutDuration:5000,cacheMaxAge:300000});
const DECISION_DOMAIN="opstruth.release-v1-verification.v1\0";
const CANARY="AyobamiH/agentproof-release-canary";
const SUBJECT="repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary";
const WORKFLOW=CANARY+"/.github/workflows/release-canary.yml@refs/heads/main";
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const REF=/^[0-9a-f]{40}$/;
class Denied extends Error {constructor(code,status=403){super(code);this.code=code;this.status=status;}}
function demand(value,code,status=403){if(!value)throw new Denied(code,status);}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,
  headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fingerprint(publicKeyPem){
  const key=createPublicKey(publicKeyPem);
  demand(key.asymmetricKeyType==="ed25519","wrong_key_algorithm",503);
  return "sha256:"+createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex");
}
function trust(env){
  demand(env.ENABLED==="true"&&REF.test(env.TRUSTED_SOURCE_SHA)&&!/^0+$/.test(env.TRUSTED_SOURCE_SHA),
    "provider_disabled",503);
  demand(DIGEST.test(env.SIGNER_FINGERPRINT)&&DIGEST.test(env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT)&&
    DIGEST.test(env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT)&&
    DIGEST.test(env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT)&&
    DIGEST.test(env.TRUSTED_PROVENANCE_SIGNER_FINGERPRINT),"trust_not_configured",503);
  // Cryptographically valid signatures alone do not establish independent
  // evidence if the same signer is reused across proposer/approval/receipt,
  // provenance and verification. Enforce distinct, externally pinned keys.
  const rolePins=[env.SIGNER_FINGERPRINT,env.TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT,
    env.TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT,
    env.TRUSTED_DONESTATE_HANDOFF_FINGERPRINT,
    env.TRUSTED_PROVENANCE_SIGNER_FINGERPRINT];
  demand(new Set(rolePins).size===rolePins.length,"role_separation_missing",503);
  let subject;
  try{subject=JSON.parse(env.TARGET_SUBJECT_JSON);}catch{throw new Denied("target_unconfigured",503);}
  demand(subject&&subject.schema==="opstruth.release-v1.subject.v1"&&
    subject.owner==="AyobamiH"&&subject.repository==="agentproof-release-canary"&&
    subject.ownerId===47716486&&subject.repositoryId===1423718326,
    "target_unconfigured",503);
  return subject;
}
export function validateClaims(claims,env){
  trust(env);
  const expected={repository:CANARY,repository_id:"1423718326",
    repository_owner_id:"47716486",actor_id:"47716486",ref:"refs/heads/main",
    event_name:"workflow_dispatch",runner_environment:"github-hosted",
    workflow_ref:WORKFLOW,workflow_sha:env.TRUSTED_SOURCE_SHA,sha:env.TRUSTED_SOURCE_SHA,
    sub:SUBJECT};
  for(const[k,v]of Object.entries(expected))demand(claims[k]===v,"workload_rejected");
  demand(/^\d{1,20}$/.test(claims.run_id)&&/^[1-9]\d{0,3}$/.test(claims.run_attempt),
    "workload_rejected");
  return{runId:claims.run_id};
}
async function authenticate(request,env,resolver=JWKS){
  const value=request.headers.get("authorization");
  demand(value?.startsWith("Bearer ")&&value.length<16384,"authentication_required",401);
  let claims;
  try{({payload:claims}=await jwtVerify(value.slice(7),resolver,
    {issuer:ISSUER,audience:env.AUDIENCE,algorithms:["RS256"],maxTokenAge:"10m",
      clockTolerance:5,requiredClaims:["exp","iat","nbf","jti"]}));}
  catch{throw new Denied("authentication_rejected",401);}
  return validateClaims(claims,env);
}
async function strictBody(request){
  demand(request.headers.get("content-type")?.split(";")[0]?.trim()==="application/json",
    "json_required",415);
  demand(request.body,"body_required",400);
  const reader=request.body.getReader(),chunks=[];let n=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;
    n+=chunk.value.byteLength;demand(n<=64*1024,"body_oversized",413);
    chunks.push(chunk.value);}}finally{void reader.cancel().catch(()=>{});}
  let value;
  try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{throw new Denied("invalid_json",400);}
  demand(value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).sort().join(" ")==="handoff receipt runId transactionId",
    "unexpected_request_fields",400);
  return value;
}
// Full release-domain verification includes approval, intent, timestamps,
// exact draft-to-publication readback, separate trust roots and both signatures.
export async function checkReceipt(receipt,subject,env,now=Date.now()) {
  return (await validateReleaseReceipt(receipt,subject,env,now)).receiptPayloadDigest;
}
function signer(env){
  const key=createPrivateKey(env.SIGNING_PRIVATE_KEY_PEM);
  const publicKeyPem=createPublicKey(key).export({type:"spki",format:"pem"}).toString();
  demand(key.asymmetricKeyType==="ed25519"&&publicKeyPem===env.SIGNING_PUBLIC_KEY_PEM&&
    fingerprint(publicKeyPem)===env.SIGNER_FINGERPRINT,"signer_key_invalid",503);
  return{key,publicKeyPem};
}
export async function evaluate(body,env,now=Date.now(),readerFactory=s=>new PublicReleaseReader(s),githubRunId){
  const subject=trust(env);
  demand(typeof body.runId==="string"&&/^[a-f0-9-]{36}$/.test(body.runId)&&
    body.transactionId===body.receipt?.payload?.transactionId,"run_binding_invalid");
  const receiptBinding=await validateReleaseReceipt(body.receipt,subject,env,now);
  const receiptPayloadDigest=receiptBinding.receiptPayloadDigest;
  demand(typeof githubRunId==="string"&&/^\d{1,20}$/.test(githubRunId),"github_run_unbound");
  validateRunHandoff(body.handoff,{
    runId:body.runId,transactionId:body.transactionId,
    subjectDigest:receiptBinding.subjectDigest,receiptPayloadDigest,githubRunId,
  },env,now);
  const reader=readerFactory(subject);
  const observation=await verifyReleaseV1Bytes({subject,reader,
    trustedProvenanceFingerprints:[env.TRUSTED_PROVENANCE_SIGNER_FINGERPRINT],now});
  // No production-signed false positive. Missing/contradicted observations
  // return status only; runtime can only accept a genuinely signed VERIFIED.
  if(observation.verdict!=="VERIFIED")
    return {state:observation.verdict,reasonCode:observation.reasonCode,
      signed:false,observation};
  const subjectDigest=body.receipt.payload.subjectDigest;
  const unsigned={schema:"opstruth.release-v1-signed-outcome.v1",
    runId:body.runId,transactionId:body.transactionId,
    subjectDigest,receiptPayloadDigest,observation,
    decision:"verified",observedAt:observation.observedAt,
    issuedBy:"opstruth.release-verifier"};
  const material=signer(env);
  const signature={algorithm:"ed25519",publicKeyPem:material.publicKeyPem,
    signerFingerprint:env.SIGNER_FINGERPRINT,
    signatureBase64:signEd(null,Buffer.from(DECISION_DOMAIN+stableJson(unsigned)),
      material.key).toString("base64")};
  return {state:"VERIFIED",signed:true,report:{...unsigned,signature}};
}
export async function handle(request,env,authenticateRequest=authenticate){
  try{
    const url=new URL(request.url);
    demand(!url.search,"query_not_supported",400);
    if(request.method==="GET"&&url.pathname==="/health")return reply({
      service:"opstruth-release-verifier",enabled:env.ENABLED==="true",
      sourceCommit:env.TRUSTED_SOURCE_SHA,readOnly:true,
      independentSignerConfigured:!!env.SIGNING_PUBLIC_KEY_PEM,
    });
    demand(request.method==="POST"&&url.pathname==="/v1/verify","route_not_found",404);
    const claims=await authenticateRequest(request,env);
    const body=await strictBody(request);
    return reply(await evaluate(body,env,Date.now(),s=>new PublicReleaseReader(s),claims.runId));
  }catch(error){
    return reply({error:error instanceof Denied?error.code:"verification_unavailable"},
      error instanceof Denied?error.status:503);
  }
}
export default {fetch(request,env){return handle(request,env);}};
