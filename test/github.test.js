import assert from "node:assert/strict";
import test from "node:test";
import { loadRepositorySnapshot, parseRepository } from "../src/github.js";
import { auditSecrets, checkGithubHandoff, fullAudit, reviewApiContracts, reviewMigrations, traceRoutes } from "../src/audits.js";
import { installGithubFetchMock, installRateLimitedGithubFetchMock, repositoryTree } from "./fixtures.js";

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
    assert.equal(snapshot.limits.maxFiles, 30);
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

test("raw GitHub file responses are bounded before buffering", async () => {
  const restore = installGithubFetchMock();
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith("/package.json")) {
      return new Response(new Uint8Array(1024 * 1024 + 1));
    }
    return fixtureFetch(request);
  };
  try {
    await assert.rejects(loadRepositorySnapshot("Example/project"), /GitHub raw file exceeded the 1 MiB safety limit/);
  } finally {
    restore();
  }
});

test("migration review uses a dedicated read set when generic selection is exhausted", async () => {
  const restore = installGithubFetchMock();
  const fixtureFetch = globalThis.fetch;
  const migrationPath = "supabase/migrations/999_late.sql";
  const crowdedTree = {
    ...repositoryTree,
    tree: [
      { path: "package.json", type: "blob", size: 100, sha: "package" },
      ...Array.from({ length: 35 }, (_, index) => ({ path: `services/${String(index).padStart(2, "0")}/wrangler.json`, type: "blob", size: 20, sha: `config-${index}` })),
      { path: migrationPath, type: "blob", size: 80, sha: "migration" },
    ],
  };
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "api.github.com" && url.pathname.includes("/git/trees/")) return Response.json(crowdedTree);
    if (url.hostname === "raw.githubusercontent.com") {
      const path = url.pathname.split("/").filter(Boolean).slice(3).map(decodeURIComponent).join("/");
      if (path === migrationPath) return new Response("DROP TABLE accounts;");
      if (path.endsWith("wrangler.json")) return new Response("{}");
    }
    return fixtureFetch(request);
  };
  try {
    const snapshot = await loadRepositorySnapshot("Example/project");
    assert.equal(snapshot.files.some((file) => file.path === migrationPath), false);
    assert.equal(snapshot.capabilityFiles.migrations[0].path, migrationPath);
    const review = reviewMigrations(snapshot);
    assert.equal(review.status, "complete");
    assert.equal(review.migrations.coverage.complete, true);
    assert.equal(review.migrations.coverage.discovered.count, 1);
    assert.equal(review.migrations.coverage.inspected.count, 1);
    assert.deepEqual(review.migrations.riskIndicators, [{ kind: "drop-operation", path: migrationPath }]);
  } finally {
    restore();
  }
});

test("migration cap exhaustion and truncated trees remain explicitly partial", async () => {
  const restore = installGithubFetchMock();
  const fixtureFetch = globalThis.fetch;
  const migrationEntries = Array.from({ length: 13 }, (_, index) => ({
    path: `migrations/${String(index).padStart(2, "0")}.sql`, type: "blob", size: 20, sha: `migration-${index}`,
  }));
  let truncated = false;
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "api.github.com" && url.pathname.includes("/git/trees/")) {
      return Response.json({ sha: "tree-migrations", truncated, tree: migrationEntries });
    }
    if (url.hostname === "raw.githubusercontent.com") return new Response("ALTER TABLE accounts ADD COLUMN note text;");
    return fixtureFetch(request);
  };
  try {
    const capped = reviewMigrations(await loadRepositorySnapshot("Example/project"));
    assert.equal(capped.status, "partial");
    assert.equal(capped.confidence.level, "low");
    assert.equal(capped.migrations.coverage.inspected.count, 12);
    assert.equal(capped.migrations.coverage.omitted.count, 1);
    assert.equal(capped.migrations.coverage.omitted.items[0].reason, "file_count_limit");
    assert.equal(capped.verified.some((item) => /migration coverage/i.test(item)), false);

    truncated = true;
    const incompleteTree = reviewMigrations(await loadRepositorySnapshot("Example/project"));
    assert.equal(incompleteTree.status, "partial");
    assert.equal(incompleteTree.migrations.coverage.treeComplete, false);
    assert.ok(incompleteTree.migrations.coverage.limitations.includes("tree_truncated"));
  } finally {
    restore();
  }
});

test("GitHub handoff verifies only successful exact-head signals", async () => {
  const restore = installGithubFetchMock();
  try {
    const snapshot = await loadRepositorySnapshot("Example/project");
    const passing = checkGithubHandoff(snapshot);
    assert.equal(passing.githubHandoff.signalAssessments.workflowRuns.verdict, "VERIFIED");
    assert.equal(passing.githubHandoff.signalAssessments.checkRuns.verdict, "VERIFIED");
    assert.equal(passing.githubHandoff.signalAssessments.commitStatus.verdict, "VERIFIED");

    const pending = structuredClone(snapshot);
    pending.githubStatus.workflowRuns.latest[0].status = "in_progress";
    pending.githubStatus.workflowRuns.latest[0].conclusion = null;
    const pendingResult = checkGithubHandoff(pending);
    assert.equal(pendingResult.githubHandoff.signalAssessments.workflowRuns.verdict, "UNPROVEN");
    assert.equal(pendingResult.verified.includes("Exact-head public GitHub Actions success"), false);

    const stale = structuredClone(snapshot);
    stale.githubStatus.workflowRuns.latest[0].headSha = "2".repeat(40);
    assert.equal(checkGithubHandoff(stale).githubHandoff.signalAssessments.workflowRuns.reason, "no_exact_head_workflow_runs");

    const neutral = structuredClone(snapshot);
    neutral.githubStatus.checkRuns.latest[0].conclusion = "neutral";
    const neutralResult = checkGithubHandoff(neutral);
    assert.equal(neutralResult.githubHandoff.signalAssessments.checkRuns.verdict, "RISKY");
    assert.ok(neutralResult.failures.some((item) => item.includes("check-run")));

    const contextFree = structuredClone(snapshot);
    contextFree.githubStatus.commitStatus.contexts = [];
    const contextFreeResult = checkGithubHandoff(contextFree);
    assert.equal(contextFreeResult.githubHandoff.signalAssessments.commitStatus.verdict, "UNPROVEN");
    assert.equal(contextFreeResult.verified.includes("Exact-head combined commit-status success"), false);
  } finally {
    restore();
  }
});
