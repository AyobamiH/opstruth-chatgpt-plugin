import assert from "node:assert/strict";
import test from "node:test";
import { loadRepositorySnapshot, parseRepository } from "../src/github.js";
import { auditSecrets, checkGithubHandoff, fullAudit, reviewApiContracts, traceRoutes } from "../src/audits.js";
import { installGithubFetchMock, installRateLimitedGithubFetchMock } from "./fixtures.js";

test("repository parser accepts only public github identifiers", () => {
  assert.equal(parseRepository("Example/project").fullName, "Example/project");
  assert.equal(parseRepository("https://github.com/Example/project").fullName, "Example/project");
  assert.throws(() => parseRepository("https://example.com/Example/project"), /Only public GitHub/);
  assert.throws(() => parseRepository("../../etc/passwd"), /Repository must be/);
});

test("snapshot and audits remain bounded and redact secret values", async () => {
  const restore = installGithubFetchMock();
  try {
    const snapshot = await loadRepositorySnapshot("Example/project");
    assert.equal(snapshot.repository.fullName, "Example/project");
    assert.equal(snapshot.limits.maxFiles, 38);
    assert.equal(snapshot.githubStatus.workflowRuns.latest[0].conclusion, "success");
    assert.equal(snapshot.githubStatus.branchProtection.protected, true);
    assert.equal(snapshot.files.some((file) => file.path === ".env"), false);
    assert.ok(snapshot.files.some((file) => file.path === "orchestrator/src/index.ts"));

    const secrets = auditSecrets(snapshot);
    assert.equal(secrets.secretRisk.findings.length, 1);
    assert.equal(secrets.secretRisk.findings[0].preview, "[REDACTED]");
    const fixtureSecret = "ghp_" + "abcdefghijklmnopqrstuvwxyz123456";
    assert.equal(JSON.stringify(secrets).includes(fixtureSecret), false);

    const routes = traceRoutes(snapshot).routes.map((route) => route.path);
    assert.ok(routes.includes("/api/health"));
    assert.ok(routes.includes("/projects/:id"));
    assert.ok(routes.includes("/health"));
    assert.ok(routes.includes("/api/tasks"));
    assert.ok(routes.includes("/api/runs/:id"));
    assert.ok(routes.includes("/api/runs/{id}"));

    const contracts = reviewApiContracts(snapshot);
    assert.ok(contracts.apiContracts.handlers.includes("orchestrator/src/index.ts"));

    const audit = fullAudit(snapshot);
    assert.equal(audit.changedState.changed, false);
    assert.ok(audit.details.environment.referencedVariableNames.includes("API_BASE_URL"));
    assert.ok(audit.details.deployment.platforms.includes("Cloudflare"));
    assert.equal(audit.details.githubHandoff.publicGithubStatus.commitStatus.state, "success");
    assert.equal(audit.details.githubHandoff.licence.status, "consistent");
  } finally {
    restore();
  }
});

test("licence reconciliation ignores licences confined to synced external trees", () => {
  const handoff = checkGithubHandoff({
    repository: { license: null },
    tree: [{ path: "openai-cookbook/LICENSE" }, { path: "package.json" }],
    files: [],
    githubStatus: null,
    limits: { treeTruncated: false },
  });
  assert.equal(handoff.githubHandoff.licence.present, false);
  assert.equal(handoff.githubHandoff.licence.status, "absent");
  assert.deepEqual(handoff.githubHandoff.licence.detectedFiles, []);
  assert.deepEqual(handoff.githubHandoff.licence.ignoredExternalFiles, ["openai-cookbook/LICENSE"]);
});

test("rate-limited GitHub API falls back to a bounded public archive", async () => {
  const restore = installRateLimitedGithubFetchMock();
  try {
    const snapshot = await loadRepositorySnapshot("Example/project");
    assert.equal(snapshot.repository.fullName, "Example/project");
    assert.equal(snapshot.repository.metadataSource, "public-archive-fallback");
    assert.equal(snapshot.repository.headCommitSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(snapshot.limits.archiveFallback, true);
    assert.ok(snapshot.tree.some((entry) => entry.path === "package.json"));
    assert.ok(snapshot.files.some((file) => file.path === "package.json"));
    assert.equal(snapshot.files.some((file) => file.path === ".env"), false);

    const audit = fullAudit(snapshot);
    assert.equal(audit.status, "complete");
    assert.equal(audit.changedState.changed, false);
    assert.ok(audit.details.deployment.platforms.includes("Cloudflare"));
  } finally {
    restore();
  }
});
