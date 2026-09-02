import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

async function proposal() {
  return JSON.parse(await text("governance/main-ruleset.proposed.json"));
}

function rule(document, type) {
  return document.githubRuleset.rules.find((candidate) => candidate.type === type);
}

test("governance proposal remains blocked and records provider truth", async () => {
  const document = await proposal();

  assert.equal(document.proposalState, "BLOCKED");
  assert.equal(document.repository.baseCommit, "186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5");
  assert.equal(document.providerObservation.mainProtection, "UNPROTECTED");
  assert.equal(document.githubRuleset.enforcement, "disabled");
  assert.equal(document.activation.permitted, false);
  assert.deepEqual(document.activation.blockers, [
    {
      id: "second_trusted_human_reviewer",
      state: "UNSATISFIED",
      reviewer: null,
      requirement: "Name one trusted human other than the repository owner and grant only the access needed to approve pull requests."
    }
  ]);
});

test("ruleset requires owner-controlled pull requests and blocks destructive ref updates", async () => {
  const document = await proposal();
  const pullRequest = rule(document, "pull_request");

  assert.deepEqual(document.ownership.codeOwners, ["@AyobamiH"]);
  assert.deepEqual(document.ownership.mergeAuthority, ["@AyobamiH"]);
  assert.deepEqual(document.githubRuleset.bypass_actors, [
    {
      actor_id: 47716486,
      actor_type: "User",
      bypass_mode: "pull_request"
    }
  ]);
  assert.ok(rule(document, "update"));
  assert.ok(rule(document, "deletion"));
  assert.ok(rule(document, "non_fast_forward"));
  assert.equal(pullRequest.parameters.required_approving_review_count, 1);
  assert.equal(pullRequest.parameters.require_last_push_approval, true);
  assert.equal(pullRequest.parameters.dismiss_stale_reviews_on_push, true);
  assert.equal(pullRequest.parameters.required_review_thread_resolution, true);
  assert.equal(pullRequest.parameters.require_code_owner_review, false);
  assert.deepEqual(document.ownership.emergencyBypass, {
    actors: ["@AyobamiH"],
    mode: "pull_request",
    directPush: false,
    forcePush: false,
    branchDeletion: false
  });
});

test("required contexts exactly match pull-request jobs that always emit", async () => {
  const [document, ci, reviewWorkflow] = await Promise.all([
    proposal(),
    text(".github/workflows/ci.yml"),
    text(".github/workflows/maintainer-review.yml")
  ]);
  const requiredInventory = document.hostedChecks.filter((check) => check.required);
  const requiredRule = rule(document, "required_status_checks");

  assert.deepEqual(
    requiredInventory.map((check) => ({
      context: check.context,
      workflowPath: check.workflowPath,
      job: check.job,
      runId: check.sample.runId,
      jobId: check.sample.jobId,
      headCommit: check.sample.headCommit
    })),
    [
      {
        context: "verify",
        workflowPath: ".github/workflows/ci.yml",
        job: "verify",
        runId: 33484341570,
        jobId: 99780846732,
        headCommit: "6e44130a70aa9616891629b170d839a1caccfab5"
      },
      {
        context: "review",
        workflowPath: ".github/workflows/maintainer-review.yml",
        job: "review",
        runId: 33484341539,
        jobId: 99780847006,
        headCommit: "6e44130a70aa9616891629b170d839a1caccfab5"
      }
    ]
  );
  assert.deepEqual(
    requiredRule.parameters.required_status_checks.map((check) => check.context),
    ["verify", "review"]
  );

  for (const check of requiredInventory) {
    assert.equal(check.context, check.job);
    assert.equal(check.pullRequestTrigger, true);
    assert.equal(check.pathFiltered, false);
    assert.equal(check.jobCondition, null);
    assert.equal(check.sample.conclusion, "success");
  }

  for (const workflow of [ci, reviewWorkflow]) {
    assert.match(workflow, /^\s{2}pull_request:/m);
    assert.doesNotMatch(workflow, /^\s+paths(?:-ignore)?:/m);
    assert.doesNotMatch(workflow, /^\s+if:/m);
  }
  assert.match(ci, /^\s{2}verify:\s*$/m);
  assert.match(reviewWorkflow, /^\s{2}review:\s*$/m);
});

test("path-filtered deployment is excluded from required contexts", async () => {
  const [document, deployWorkflow] = await Promise.all([
    proposal(),
    text(".github/workflows/deploy-cloudflare.yml")
  ]);
  const deploy = document.hostedChecks.find((check) => check.context === "deploy");

  assert.equal(deploy.required, false);
  assert.equal(deploy.pullRequestTrigger, false);
  assert.equal(deploy.pathFiltered, true);
  assert.match(deployWorkflow, /^\s{4}paths:\s*$/m);
});

test("candidate copy cannot claim active protection or a release transition", async () => {
  const [document, readme, codeowners, maintainerPolicy] = await Promise.all([
    proposal(),
    text("governance/README.md"),
    text(".github/CODEOWNERS"),
    text(".github/maintainer/policy.json").then(JSON.parse)
  ]);

  assert.equal(document.releaseChannelIdentity.changesDeploymentState, false);
  assert.equal(document.releaseChannelIdentity.changesPublicationState, false);
  assert.equal(document.releaseChannelIdentity.changesReleaseState, false);
  assert.equal(document.releaseChannelIdentity.version, "0.4.0");
  assert.equal(document.releaseChannelIdentity.sourceMainCommit, "186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5");
  assert.equal(document.releaseChannelIdentity.chatgptDirectoryState, "PUBLISHED");
  assert.match(readme, /Status: `BLOCKED`/);
  assert.match(readme, /reported `main` as `UNPROTECTED`/);
  assert.match(readme, /second trusted human reviewer/i);
  assert.doesNotMatch(readme, /\bmain is protected\b/i);
  assert.doesNotMatch(readme, /\bruleset is active\b/i);
  assert.doesNotMatch(readme, /\bgovernance is production[- ]ready\b/i);
  assert.match(codeowners, /^\* @AyobamiH$/m);
  assert.match(codeowners, /^governance\/ @AyobamiH$/m);
  assert.equal(maintainerPolicy.protectedPrefixes.includes("governance/"), true);
  assert.equal(maintainerPolicy.protectedFiles.includes("test/governance.test.js"), true);
  assert.equal(maintainerPolicy.authoritySensitivePrefixes.includes("governance/"), true);

  for (const candidate of [JSON.stringify(document), readme, codeowners]) {
    assert.equal(candidate.includes("\u2014"), false, "public governance copy must not contain a long em dash");
  }
});
