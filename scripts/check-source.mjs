import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.(?:js|mjs)$/.test(entry.name)) result.push(path);
  }
  return result;
}

const forbidden = [
  ["child process execution", /node:child_process|child_process/],
  ["dynamic evaluation", /\beval\s*\(|new\s+Function\s*\(/],
  ["credential tool input", /(?:credential|password)\s*:/i],
];

const failures = [];
for (const path of await files(fileURLToPath(new URL("../src", import.meta.url)))) {
  const source = await readFile(path, "utf8");
  for (const [label, pattern] of forbidden) if (pattern.test(source)) failures.push(`${path}: ${label}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("source safety check passed");
