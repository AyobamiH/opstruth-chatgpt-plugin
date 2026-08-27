import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const target = resolve(process.argv[2] || ".");
const toolsModule = await import(pathToFileURL(resolve(target, "src/tools.js")));
const fixtureModule = await import(pathToFileURL(resolve(target, "test/fixtures.js")));

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

const samples = [];
const restore = fixtureModule.installGithubFetchMock();
try {
  for (let index = 0; index < 5; index += 1) await toolsModule.callTool("opstruth_audit_repository", { repository_url: "Example/project" }, {}, {});
  for (let index = 0; index < 40; index += 1) {
    const started = performance.now();
    await toolsModule.callTool("opstruth_audit_repository", { repository_url: "Example/project" }, {}, {});
    samples.push(performance.now() - started);
  }
} finally {
  restore();
}

console.log(JSON.stringify({
  target,
  samples: samples.length,
  medianMs: Number(percentile(samples, 0.5).toFixed(3)),
  p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
  maxMs: Number(Math.max(...samples).toFixed(3)),
}));

