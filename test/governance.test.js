import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
const text = path => readFile(new URL(path, root), "utf8");
const proposal = async () => JSON.parse(await text("governance/main-ruleset.proposed.json"));
const rule = (document, type) => document.githubRuleset.rules.find(candidate => candidate.type === type);
test("governance records active provider protection", async () => {
  const document = await proposal();
  assert.equal(document.proposalState, "ACTIVE");
  assert.equal(document.repository.baseCommit, "7cc308895cbbe06856cb4a3c80ff243a58eeb132");
  assert.equal(document.providerObservation.mainProtection, "PROTECTED");
  assert.equal(document.providerObservation.requiredStatusEnforcement, "ON");
  assert.equal(document.providerObservation.activeRulesets, 1);
  assert.equal(document.providerObservation.rulesetId, 22247265);
  assert.equal(document.githubRuleset.enforcement, "disabled");
  assert.equal(document.activation.permitted, true);
  assert.equal(document.activation.blockers.length, 0);
  assert.equal(document.stages.mechanicalBaseline.state, "ACTIVE");
  assert.equal(document.stages.mechanicalBaseline.requiredApprovals, 0);
  assert.equal(document.activationReadBack.state, "VERIFIED");
});
test("ruleset template preserves Stage 1 controls", async () => {
  const document = await proposal();
  assert.ok(rule(document, "deletion"));
  assert.ok(rule(document, "non_fast_forward"));
  assert.deepEqual(document.githubRuleset.bypass_actors, [{ actor_id: 47716486, actor_type: "User", bypass_mode: "always" }]);
  assert.equal(rule(document, "pull_request").parameters.required_approving_review_count, 0);
  assert.deepEqual(rule(document, "required_status_checks").parameters.required_status_checks, [{ context: "verify", integration_id: 15368 }, { context: "review", integration_id: 15368 }]);
});
test("provider read-back and governance copy agree", async () => {
  const [document, readBack, readme, status] = await Promise.all([proposal(), text("governance/provider-enforcement-readback.json").then(JSON.parse), text("governance/README.md"), text("docs/CURRENT-STATUS.md")]);
  assert.equal(readBack.protected, true);
  assert.equal(readBack.activeRuleset.id, 22247265);
  assert.deepEqual(readBack.activeRuleset.requiredStatusChecks.map(x => x.context), ["verify", "review"]);
  for (const copy of [readme, status]) {
    assert.match(copy, /PROTECTED/);
    assert.match(copy, /22247265/);
    assert.doesNotMatch(copy, /Status: `BLOCKED_PROVIDER_ACTION`/);
    assert.doesNotMatch(copy, /main` is currently unprotected/i);
  }
  assert.equal(document.releaseChannelIdentity.changesDeploymentState, false);
  assert.equal(document.releaseChannelIdentity.changesPublicationState, false);
  assert.equal(document.releaseChannelIdentity.changesReleaseState, false);
});
