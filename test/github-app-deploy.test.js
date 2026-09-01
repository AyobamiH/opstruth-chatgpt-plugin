import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const secretNames = [
  "OPSTRUTH_GITHUB_APP_ID",
  "OPSTRUTH_GITHUB_APP_INSTALLATION_ID",
  "OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM",
];

test("deployment configuration pins only the reviewed public verification repository", async () => {
  const wranglerSource = await readFile(new URL("wrangler.jsonc", root), "utf8");
  const wrangler = JSON.parse(wranglerSource);
  assert.deepEqual(wrangler.vars, {
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY: "AyobamiH/donestate",
    OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID: "1348643925",
  });
  for (const secret of secretNames) assert.equal(Object.hasOwn(wrangler.vars, secret), false);
});

test("deployment checks GitHub App Worker secret names before the first deploy without provisioning values", async () => {
  const workflow = await readFile(new URL(".github/workflows/deploy-cloudflare.yml", root), "utf8");
  const firstDeploy = workflow.indexOf("wrangler@4.127.0 deploy");
  assert.ok(firstDeploy > 0);
  for (const secret of secretNames) {
    const preflight = workflow.indexOf(secret);
    assert.ok(preflight > 0 && preflight < firstDeploy, `${secret} must be checked before deployment`);
    assert.equal(workflow.includes(`secret put ${secret}`), false);
    assert.equal(workflow.includes(`secrets.${secret}`), false);
  }
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest\s+env:\s+[^]*?CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /- run: npm run check\s+- name: Require Cloudflare deployment secrets\s+env: &cloudflare-credentials/);
  assert.match(workflow, /Require verifier GitHub App Worker secrets[^]*?env: \*cloudflare-credentials/);
  assert.match(workflow, /Deploy bootstrap Worker with commit identity[^]*?env: \*cloudflare-credentials/);
  assert.match(workflow, /Provision stable evidence-signing key once[^]*?env: \*cloudflare-credentials/);
  assert.match(workflow, /Deploy final Worker with stable commit identity[^]*?env: \*cloudflare-credentials/);
});

test("source contains no legacy static GitHub token lane", async () => {
  const sources = await Promise.all([
    readFile(new URL("src/github.js", root), "utf8"),
    readFile(new URL("src/github-app.js", root), "utf8"),
    readFile(new URL("src/worker.js", root), "utf8"),
  ]);
  assert.equal(sources.join("\n").includes("GITHUB_READ_TOKEN"), false);
});
