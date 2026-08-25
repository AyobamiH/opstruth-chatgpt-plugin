import assert from "node:assert/strict";
import test from "node:test";
import { loadRepositorySnapshot, parseRepository } from "../src/github.js";
import { auditSecrets, fullAudit, traceRoutes } from "../src/audits.js";
import { installGithubFetchMock } from "./fixtures.js";

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
    assert.equal(snapshot.files.some((file) => file.path === ".env"), false);

    const secrets = auditSecrets(snapshot);
    assert.equal(secrets.secretRisk.findings.length, 1);
    assert.equal(secrets.secretRisk.findings[0].preview, "[REDACTED]");
    const fixtureSecret = "ghp_" + "abcdefghijklmnopqrstuvwxyz123456";
    assert.equal(JSON.stringify(secrets).includes(fixtureSecret), false);

    const routes = traceRoutes(snapshot).routes.map((route) => route.path);
    assert.ok(routes.includes("/api/health"));
    assert.ok(routes.includes("/projects/:id"));

    const audit = fullAudit(snapshot);
    assert.equal(audit.changedState.changed, false);
    assert.ok(audit.details.environment.referencedVariableNames.includes("API_BASE_URL"));
    assert.ok(audit.details.deployment.platforms.includes("Cloudflare"));
  } finally {
    restore();
  }
});
