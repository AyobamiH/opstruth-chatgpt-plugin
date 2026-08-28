import { access, readFile } from "node:fs/promises";

for (const file of ["README.md", "docs/CURRENT-STATUS.md", "docs/roadmap/0.4.0.md", "docs/release-readiness.md", "docs/architecture/BOUNDARIES.md", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [status, roadmap] = await Promise.all([
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/roadmap/0.4.0.md", import.meta.url), "utf8"),
]);
if (roadmap.includes("release candidate implemented; remote and publication gates pending")) throw new Error("0.4.0 roadmap has stale publication status");
for (const subject of ["dc26a21a5793508b9d0666b6cfebb492bfdce080", "09544c3ede70b832a114918bb439960004655faf9d36981e1402587af9429c86", "read-only"]) {
  if (!status.includes(subject)) throw new Error(`current status is missing required subject: ${subject}`);
}
console.log("documentation closure: ok");
