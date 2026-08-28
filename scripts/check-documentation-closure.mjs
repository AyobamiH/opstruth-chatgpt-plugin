import { access, readFile } from "node:fs/promises";

for (const file of ["README.md", "docs/CURRENT-STATUS.md", "docs/roadmap/0.4.0.md", "docs/release-readiness.md", "docs/architecture/BOUNDARIES.md", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [status, roadmap] = await Promise.all([
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/roadmap/0.4.0.md", import.meta.url), "utf8"),
]);
if (roadmap.includes("release candidate implemented; remote and publication gates pending")) throw new Error("0.4.0 roadmap has stale publication status");
for (const subject of ["255bab7b55b9f6587e3534d3b2afbacb2eed7321", "33210945478", "09544c3ede70b832a114918bb439960004655faf9d36981e1402587af9429c86", "read-only"]) {
  if (!status.includes(subject)) throw new Error(`current status is missing required subject: ${subject}`);
}
console.log("documentation closure: ok");
