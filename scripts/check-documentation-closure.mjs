import { access, readFile } from "node:fs/promises";

for (const file of ["README.md", "docs/CURRENT-STATUS.md", "docs/roadmap/0.4.0.md", "docs/release-readiness.md", "docs/architecture/BOUNDARIES.md", "governance/release-state.json", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [status, roadmap, releaseStateText] = await Promise.all([
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/roadmap/0.4.0.md", import.meta.url), "utf8"),
  readFile(new URL("../governance/release-state.json", import.meta.url), "utf8"),
]);
if (roadmap.includes("release candidate implemented; remote and publication gates pending")) throw new Error("0.4.0 roadmap has stale publication status");
const releaseState = JSON.parse(releaseStateText);
if (releaseState.schemaVersion !== "1.0.0" || releaseState.product !== "OpsTruth") throw new Error("release state identity is invalid");
if (!/^[a-f0-9]{40}$/.test(releaseState.source?.commit || "")) throw new Error("release state source commit is invalid");
if (!Number.isFinite(Date.parse(releaseState.observedAt))) throw new Error("release state observation time is invalid");
if (releaseState.channels?.openaiPlugin?.state !== "PUBLIC") throw new Error("OpenAI public channel state is not reconciled");
if (releaseState.channels?.githubAction?.separateArtifact !== true) throw new Error("GitHub Action must remain a separate artifact");
if (releaseState.governance?.mainProtected !== false || releaseState.governance?.commitBoundPluginRelease !== "ABSENT") {
  throw new Error("release governance gaps must remain explicit until independently closed");
}
if (!Array.isArray(releaseState.openP0Issues) || !releaseState.openP0Issues.includes(18)) throw new Error("release blockers are incomplete");
const requiredSubjects = [
  releaseState.source.commit,
  releaseState.source.ciRun,
  releaseState.source.deploymentRun,
  releaseState.source.deploymentLogWorkerVersion,
  releaseState.channels.openaiPlugin.listingUrl,
  releaseState.channels.githubAction.sourceRepository,
  releaseState.channels.githubAction.sourceCommit,
  releaseState.verification.historicalDoneStateRun,
  releaseState.verification.freshDoneStateRun,
  "read-only",
];
for (const subject of requiredSubjects) {
  if (!status.includes(subject)) throw new Error(`current status is missing required subject: ${subject}`);
}
console.log("documentation closure: ok");
