// No credentials, writes, API POST requests, or caching; narrowly allowlisted
// public GitHub release readback and actual binary asset download.
export const MAX_JSON_BYTES = 256 * 1024;
export const REQUEST_TIMEOUT_MS = 12_000;
const API = "https://api.github.com";
const TRUSTED_DOWNLOAD_HOSTS = new Set([
  "github.com", "release-assets.githubusercontent.com",
  "objects.githubusercontent.com", "github-releases.githubusercontent.com",
]);
function required(ok,code){if(!ok)throw new Error("read_only_release:"+code);}
async function readBytes(response,max,signal){
  const contentLength=Number(response.headers.get("content-length")??"0");
  required(!contentLength || (Number.isSafeInteger(contentLength) && contentLength<=max),"response_too_large");
  required(response.body,"empty_response");
  const reader=response.body.getReader(),chunks=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener("abort",abort,{once:true});
  try{while(true){
    required(!signal.aborted,"provider_read_timeout");
    const part=await reader.read();required(!signal.aborted,"provider_read_timeout");
    if(part.done)break;size+=part.value.byteLength;
    required(size<=max,"response_too_large");chunks.push(part.value);
  }}finally{signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>{});}
  return new Uint8Array(Buffer.concat(chunks));
}
async function publicGet(url,accept,maxBytes,allowAssetRedirect=false,options={}){
  const timeoutMs=options.timeoutMs??REQUEST_TIMEOUT_MS;
  required(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=REQUEST_TIMEOUT_MS,"invalid_timeout");
  const signal=AbortSignal.timeout(timeoutMs),fetcher=options.fetcher??fetch;
  let next=new URL(url),hops=0;
  while(true){
    required(!signal.aborted,"provider_read_timeout");
    required(next.protocol==="https:" && next.username==="" && next.password==="" && next.port==="" &&
      !next.hash && (hops===0 ? next.hostname==="api.github.com" || next.hostname==="github.com" :
      TRUSTED_DOWNLOAD_HOSTS.has(next.hostname)),"unsupported_download_host");
    const response=await fetcher(next.href,{method:"GET",redirect:"manual",cache:"no-store",signal,
      headers:{"accept":accept,"user-agent":"opstruth-independent-release-verifier/1.0",
        "x-github-api-version":"2022-11-28"}});
    if([301,302,303,307,308].includes(response.status)){
      void response.body?.cancel().catch(()=>{});
      required(allowAssetRedirect && ++hops<=3,"unexpected_redirect");
      const location=response.headers.get("location");required(location,"missing_redirect_location");
      const target=new URL(location,next);
      required(TRUSTED_DOWNLOAD_HOSTS.has(target.hostname)&&target.protocol==="https:",
        "redirect_target_rejected");
      next=target;continue;
    }
    if(!response.ok||response.status!==200){
      void response.body?.cancel().catch(()=>{});
      required(false,"provider_not_available");
    }
    return readBytes(response,maxBytes,signal);
  }
}
async function jsonGet(path,options){
  required(/^\/repos\/AyobamiH\/agentproof-release-canary(?:\/[A-Za-z0-9._/-]+)?$/.test(path),
    "unexpected_api_path");
  const bytes=await publicGet(API+path,"application/vnd.github+json",MAX_JSON_BYTES,false,options);
  const raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  required(!raw.includes("\u0000"),"invalid_json");
  const data=JSON.parse(raw);
  required(data&&typeof data==="object"&&!Array.isArray(data),"invalid_json");
  return data;
}
export class PublicReleaseReader {
  constructor(subject,options={}){this.subject=subject;this.assets=new Map();this.options=options;}
  async observe(subject){
    required(JSON.stringify(subject)===JSON.stringify(this.subject),"subject_changed");
    required(subject.owner==="AyobamiH"&&subject.repository==="agentproof-release-canary"&&
      subject.ownerId===47716486&&subject.repositoryId===1423718326,"repository_not_allowed");
    const repo=await jsonGet("/repos/AyobamiH/agentproof-release-canary",this.options);
    required(repo.id===subject.repositoryId&&repo.owner?.id===subject.ownerId&&
      repo.owner?.login===subject.owner&&repo.name===subject.repository&&
      repo.private===false,"repository_identity_changed");
    const ref=await jsonGet("/repos/AyobamiH/agentproof-release-canary/git/ref/tags/"+subject.tagName,this.options);
    required(ref.ref==="refs/tags/"+subject.tagName&&ref.object?.type==="commit"&&
      ref.object.sha===subject.tagCommit,"tag_commit_changed");
    const release=await jsonGet("/repos/AyobamiH/agentproof-release-canary/releases/"+subject.releaseId,this.options);
    required(release.id===subject.releaseId&&release.tag_name===subject.tagName&&
      Array.isArray(release.assets)&&release.assets.length===2,"release_identity_changed");
    const pkg=release.assets.find(x=>x.id===subject.packageAssetId);
    const provenance=release.assets.find(x=>x.id===subject.provenanceAssetId);
    required(pkg?.state==="uploaded"&&pkg?.name===subject.packageAssetName&&
      provenance?.state==="uploaded"&&pkg.digest===subject.packageDigest&&
      provenance.digest===subject.provenanceDigest&&
      typeof pkg.browser_download_url==="string"&&typeof provenance.browser_download_url==="string",
      "release_asset_changed");
    this.assets=new Map([[pkg.id,pkg.browser_download_url],[provenance.id,provenance.browser_download_url]]);
    return{owner:subject.owner,repository:subject.repository,ownerId:subject.ownerId,
      repositoryId:subject.repositoryId,releaseId:subject.releaseId,tagName:subject.tagName,
      tagCommit:subject.tagCommit,prerelease:release.prerelease,draft:release.draft,
      publishedAt:release.published_at,observedAt:new Date().toISOString(),packageAssetId:subject.packageAssetId,
      packageAssetName:subject.packageAssetName,packageDigest:pkg.digest,
      provenanceAssetId:subject.provenanceAssetId,provenanceDigest:provenance.digest,
      assetCount:release.assets.length};
  }
  async downloadAsset(id,maxBytes){
    required(this.assets.has(id)&&[this.subject.packageAssetId,this.subject.provenanceAssetId].includes(id),
      "asset_not_observed");
    const url=this.assets.get(id),parsed=new URL(url);
    required(parsed.protocol==="https:"&&parsed.hostname==="github.com"&&
      parsed.pathname.startsWith("/AyobamiH/agentproof-release-canary/releases/download/"+
        this.subject.tagName+"/"),"download_url_not_allowlisted");
    return publicGet(url,"application/octet-stream",maxBytes,true,this.options);
  }
}
