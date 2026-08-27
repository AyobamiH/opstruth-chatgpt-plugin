import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyChangedPaths, renderReview } from "../scripts/maintainer-review.mjs";

const policy = JSON.parse(await readFile(new URL("../.github/maintainer/policy.json", import.meta.url), "utf8"));

test("documentation-only changes have no release impact", () => {
  const result = classifyChangedPaths(["docs/roadmap/0.4.0.md"], policy);
  assert.equal(result.releaseImpact, "none");
  assert.deepEqual(result.protectedChanges, []);
});

test("contracts and authority constitution require major human review", () => {
  const result = classifyChangedPaths(["contracts/action-request.schema.json", "docs/architecture/BOUNDARIES.md"], policy);
  assert.equal(result.releaseImpact, "major");
  assert.equal(result.protectedChanges.length, 2);
  assert.equal(result.authoritySensitive.includes("contracts/action-request.schema.json"), true);
});

test("maintainer control changes require major human review", () => {
  const result = classifyChangedPaths(["scripts/maintainer-review.mjs", ".github/workflows/maintainer-review.yml"], policy);
  assert.equal(result.releaseImpact, "major");
  assert.equal(result.protectedChanges.length, 2);
});

test("review report distinguishes verified, risky, unproven, and release impact", () => {
  const classification = classifyChangedPaths(["src/tools.js"], policy);
  const report = renderReview(classification, { checkStatus: "passed", boundaryStatus: "passed" });
  for (const heading of ["VERIFIED", "RISKY", "UNPROVEN", "ARCHITECTURE", "RELEASE IMPACT"]) assert.match(report, new RegExp(heading));
  assert.match(report, /It is not an approval/);
});
