import { appendFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function matches(path, candidates) {
  return candidates.some((candidate) => path === candidate || path.startsWith(candidate));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function classifyChangedPaths(paths, policy) {
  const changed = uniqueSorted(paths.filter(Boolean));
  const protectedChanges = changed.filter((path) => policy.protectedFiles.includes(path) || matches(path, policy.protectedPrefixes));
  const authoritySensitive = changed.filter((path) => matches(path, policy.authoritySensitivePrefixes));
  let releaseImpact = "none";
  if (changed.some((path) => matches(path, policy.patchImpactPrefixes))) releaseImpact = "patch";
  if (changed.some((path) => matches(path, policy.minorImpactPrefixes))) releaseImpact = "minor";
  if (protectedChanges.length) releaseImpact = "major";
  return { changed, protectedChanges, authoritySensitive, releaseImpact };
}

function gitLines(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function changedPaths() {
  const base = process.env.OPSTRUTH_BASE_REF;
  const head = process.env.OPSTRUTH_HEAD_REF || "HEAD";
  if (base) return gitLines(["diff", "--name-only", `${base}...${head}`]);
  return gitLines(["diff", "--name-only", "HEAD^", "HEAD"]);
}

function bullets(values, empty) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${empty}`;
}

export function renderReview(classification, options = {}) {
  const checksPassed = options.checkStatus === "passed";
  const boundariesPassed = options.boundaryStatus === "passed";
  const verified = [
    `${classification.changed.length} changed path(s) classified from the supplied base and head revisions.`,
  ];
  if (checksPassed) verified.push("The complete repository check command passed in this workflow run.");
  if (boundariesPassed) verified.push("The deterministic authority-boundary check passed.");

  const risky = [];
  if (classification.protectedChanges.length) risky.push(`Protected human-review paths changed: ${classification.protectedChanges.join(", ")}.`);
  if (classification.authoritySensitive.length) risky.push(`Authority-sensitive paths changed: ${classification.authoritySensitive.join(", ")}.`);

  const unproven = [
    "Branch-protection and required-review settings were not inspected by this contents-read workflow.",
    "Human approval, production state, OpenAI review, and publication state were not verified.",
  ];
  if (!checksPassed) unproven.push("The complete repository check command was not reported as passed.");
  if (!boundariesPassed) unproven.push("The deterministic authority-boundary check was not reported as passed.");

  const architecture = boundariesPassed ? "Boundary preserved by deterministic checks: yes." : "Boundary preserved by deterministic checks: unproven.";
  return [
    "# OpsTruth maintainer review",
    "",
    "## VERIFIED",
    "",
    bullets(verified, "No verification evidence was supplied."),
    "",
    "## RISKY",
    "",
    bullets(risky, "No protected or authority-sensitive changed paths were identified."),
    "",
    "## UNPROVEN",
    "",
    bullets(unproven, "No proof gaps were recorded."),
    "",
    "## ARCHITECTURE",
    "",
    architecture,
    "",
    "## RELEASE IMPACT",
    "",
    classification.releaseImpact,
    "",
    "This deterministic report is evidence for a human maintainer. It is not an approval.",
  ].join("\n");
}

async function main() {
  const policy = JSON.parse(await readFile(new URL("../.github/maintainer/policy.json", import.meta.url), "utf8"));
  const classification = classifyChangedPaths(changedPaths(), policy);
  const report = renderReview(classification, {
    checkStatus: process.env.OPSTRUTH_CHECK_STATUS,
    boundaryStatus: process.env.OPSTRUTH_BOUNDARY_STATUS,
  });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, "utf8");
}

if (basename(process.argv[1] || "") === "maintainer-review.mjs") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
