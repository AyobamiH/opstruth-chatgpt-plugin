import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const contractRoot = join(root, "contracts", "donestate");
const manifest = JSON.parse(await readFile(join(contractRoot, "manifest.json"), "utf8"));
const remote = process.argv.includes("--remote");

if (manifest.schemaVersion !== "1.0.0") throw new Error("DoneState contract manifest schema version drifted");
if (manifest.sourceRepository !== "https://github.com/AyobamiH/donestate") throw new Error("DoneState contract source repository drifted");
if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit || "")) throw new Error("DoneState contract source commit is invalid");

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function doneStatePath(artifact) {
  return `schemas/${artifact}`;
}

const failures = [];
for (const [artifact, expectedSha] of Object.entries(manifest.artifacts || {})) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
    failures.push(`${artifact}: manifest blob SHA is invalid`);
    continue;
  }
  const bytes = await readFile(join(contractRoot, artifact));
  const actualSha = gitBlobSha(bytes);
  if (actualSha !== expectedSha) failures.push(`${artifact}: vendored blob ${actualSha} != manifest ${expectedSha}`);
}

async function githubJson(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "opstruth-donestate-contract-drift-sentinel",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub read failed ${response.status}: ${path}`);
  return response.json();
}

if (remote) {
  const repo = "AyobamiH/donestate";
  const branch = await githubJson(`/repos/${repo}/branches/main`);
  if (!/^[a-f0-9]{40}$/.test(branch?.commit?.sha || "")) failures.push("DoneState main head could not be resolved");

  for (const [artifact, expectedSha] of Object.entries(manifest.artifacts || {})) {
    const sourcePath = doneStatePath(artifact).split("/").map(encodeURIComponent).join("/");
    const file = await githubJson(`/repos/${repo}/contents/${sourcePath}?ref=main`);
    if (file?.sha !== expectedSha) failures.push(`${sourcePath}: DoneState main blob ${file?.sha ?? "missing"} != locked ${expectedSha}`);
  }

  const contractFile = await githubJson(`/repos/${repo}/contents/contracts/donestate-opstruth-verification.v2.json?ref=main`);
  if (!contractFile?.content) {
    failures.push("DoneState v2 contract manifest is missing on main");
  } else {
    const contract = JSON.parse(Buffer.from(contractFile.content, "base64").toString("utf8"));
    if (contract.contractVersion !== "donestate.verification-contract.v2") failures.push("DoneState contractVersion drifted");
    if (contract.responseSchemaPath !== "schemas/verification-response-v2.schema.json") failures.push("DoneState response schema path drifted");
    if (contract.compatibility?.historicalOutcomes !== "never rewritten by this contract") failures.push("DoneState historical-outcome invariant drifted");
  }
}

if (failures.length) {
  console.error(["DoneState/OpsTruth contract drift detected:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(`DoneState/OpsTruth contract lock: ok (${Object.keys(manifest.artifacts || {}).length} artifacts${remote ? ", remote main checked" : ""})`);
