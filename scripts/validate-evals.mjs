import { readFile } from "node:fs/promises";

const evals = JSON.parse(await readFile(new URL("../evals/golden-prompts.json", import.meta.url), "utf8"));
const errors = [];
if (evals.schemaVersion !== "1.0.0") errors.push("golden prompt schema version mismatch");
if (!Array.isArray(evals.positive) || evals.positive.length !== 5) errors.push("exactly five positive prompts are required");
if (!Array.isArray(evals.negative) || evals.negative.length !== 3) errors.push("exactly three negative prompts are required");
for (const item of [...(evals.positive || [])]) {
  if (!item.id || !item.prompt || !item.expectedTool || !item.expectedSkill) errors.push(`${item.id || "positive"}: incomplete positive case`);
}
for (const item of [...(evals.negative || [])]) {
  if (!item.id || !item.prompt || !item.expectedBehaviour) errors.push(`${item.id || "negative"}: incomplete negative case`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`golden prompt validation passed: ${evals.positive.length} positive, ${evals.negative.length} negative`);
