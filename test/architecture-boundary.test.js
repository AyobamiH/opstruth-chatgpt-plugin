import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("repository authority boundary passes its deterministic check", () => {
  const result = spawnSync(process.execPath, ["scripts/check-boundaries.mjs"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /architecture boundary check passed/);
});
