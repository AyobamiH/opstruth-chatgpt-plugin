import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "governance", "main-ruleset.proposed.json"), "utf8"));
const ci = await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8");
const reviewWorkflow = await readFile(join(root, ".github", "workflows", "maintainer-review.yml"), "utf8");
const status = await readFile(join(root, "docs", "CURRENT-STATUS.md"), "utf8");
const codeowners = await readFile(join(root, ".github", "CODEOWNERS"), "utf8");

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function exactSet(actual, expected, message) {
  requireValue(Array.isArray(actual), message);
  requireValue(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), message);
}

requireValue(manifest.schemaVersion === "2.0.0", "OpsTruth main governance schema drifted");
requireValue(manifest.proposalState === "BLOCKED_PROVIDER_ACTION", "provider activation must remain blocked until read-back");
requireValue(manifest.repository?.name === "AyobamiH/opstruth-chatgpt-plugin", "repository identity drifted");
requireValue(manifest.repository?.repositoryId === 1345997124, "repository ID drifted");
requireValue(manifest.repository?.baseCommit === "eef00ca4f242cf99d6b39e8c37ae4b84970a86e4", "provider observation base commit drifted");
requireValue(manifest.providerObservation?.mainProtection === "UNPROTECTED", "main must remain UNPROTECTED until provider evidence changes");
requireValue(manifest.providerObservation?.requiredStatusEnforcement === "OFF", "status enforcement must remain OFF until provider evidence changes");
requireValue(manifest.providerObservation?.activeRulesets === 0 && manifest.providerObservation?.rulesetId === null, "unprotected state cannot invent an active ruleset");
requireValue(manifest.activation?.blockers?.length === 1 && manifest.activation.blockers[0].id === "provider_ruleset_write", "provider settings write must be the only activation blocker");
requireValue(manifest.stages?.mechanicalBaseline?.state === "READY_FOR_PROVIDER_ACTIVATION", "mechanical baseline must be activation-ready");
requireValue(manifest.stages?.mechanicalBaseline?.requiredApprovals === 0, "mechanical baseline must require zero approvals");
requireValue(manifest.stages?.mechanicalBaseline?.requiresSecondHumanReviewer === false, "human reviewer cannot block mechanical protection");
requireValue(manifest.stages?.independentHumanReview?.state === "FOLLOW_ON", "human review must be a follow-on strengthening stage");
requireValue(manifest.stages?.independentHumanReview?.requiredApprovalsAfterActivation === 1, "follow-on review must add one approval");
requireValue(manifest.stages?.independentHumanReview?.mustNotWeakenMechanicalBaseline === true, "review upgrade cannot weaken mechanical protection");
requireValue(manifest.ownership?.independentReviewer?.reviewer === null && manifest.ownership?.independentReviewer?.state === "UNNAMED", "do not invent an independent reviewer");
requireValue(manifest.ownership?.independentReviewer?.activationBlocker === false, "unnamed reviewer cannot block mechanical activation");
requireValue(codeowners.includes("* @AyobamiH"), "CODEOWNERS must identify the current owner");

const requiredChecks = manifest.hostedChecks.filter((check) => check.required).map((check) => check.context);
exactSet(requiredChecks, ["verify", "review"], "required check inventory must be exactly verify and review");
requireValue(manifest.hostedChecks.filter((check) => check.required).every((check) => check.integrationId === 15368), "required checks must be pinned to GitHub Actions");
requireValue(/^name: CI$/m.test(ci) && /^  pull_request:\s*$/m.test(ci) && /^  verify:\s*$/m.test(ci), "CI must emit verify on pull requests");
requireValue(!/paths:|paths-ignore:|continue-on-error:/m.test(ci), "CI verify cannot be conditionally skipped");
requireValue(/^name: OpsTruth maintainer review$/m.test(reviewWorkflow) && /^  pull_request:/m.test(reviewWorkflow) && /^  review:\s*$/m.test(reviewWorkflow), "maintainer review must emit review on pull requests");
requireValue(!/paths:|paths-ignore:|continue-on-error:/m.test(reviewWorkflow), "maintainer review cannot be conditionally skipped");

const ruleset = manifest.githubRuleset;
requireValue(ruleset?.target === "branch" && ruleset?.enforcement === "disabled", "checked-in ruleset cannot claim provider enforcement");
exactSet(ruleset?.conditions?.ref_name?.include, ["refs/heads/main"], "ruleset must target only main");
exactSet(ruleset?.conditions?.ref_name?.exclude, [], "ruleset exclusions must be empty");
requireValue(ruleset?.bypass_actors?.length === 1, "exactly one owner emergency bypass is allowed");
const bypass = ruleset.bypass_actors[0];
requireValue(bypass.actor_id === 47716486 && bypass.actor_type === "User" && bypass.bypass_mode === "always", "owner bypass drifted");
const rules = new Map(ruleset.rules.map((rule) => [rule.type, rule]));
for (const type of ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]) requireValue(rules.has(type), `ruleset missing ${type}`);
const pr = rules.get("pull_request").parameters;
requireValue(pr.required_approving_review_count === 0 && pr.require_code_owner_review === false && pr.require_last_push_approval === false, "mechanical baseline must not invent human approval");
requireValue(pr.required_review_thread_resolution === true, "review conversations must resolve");
const checks = rules.get("required_status_checks").parameters;
exactSet(checks.required_status_checks.map((check) => check.context), ["verify", "review"], "ruleset required checks drifted");
requireValue(checks.required_status_checks.every((check) => check.integration_id === 15368), "ruleset checks must be GitHub Actions checks");
requireValue(checks.strict_required_status_checks_policy === true, "required checks must be current with main");
requireValue(manifest.activationReadBack?.state === "NOT_ATTEMPTED" && manifest.activationReadBack?.rulesetId === null, "provider read-back cannot advance before activation");
requireValue(status.includes("main` is currently unprotected") || status.includes("main is currently unprotected") || status.includes("main` remains unprotected"), "current status must remain truthful about unprotected main");
requireValue(status.includes("BLOCKED_PROVIDER_ACTION"), "current status must expose the provider activation blocker");

console.log("OpsTruth main governance proposal: mechanical baseline ready; provider activation pending");
