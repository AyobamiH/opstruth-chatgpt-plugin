import { readFile } from "node:fs/promises";

const evals = JSON.parse(await readFile(new URL("../evals/golden-prompts.json", import.meta.url), "utf8"));
const matrix = JSON.parse(await readFile(new URL("../evals/product-value-matrix.json", import.meta.url), "utf8"));
const errors = [];
if (evals.schemaVersion !== "1.0.0") errors.push("golden prompt schema version mismatch");
if (!Array.isArray(evals.positive) || evals.positive.length !== 8) errors.push("exactly eight positive prompts are required");
if (!Array.isArray(evals.negative) || evals.negative.length !== 5) errors.push("exactly five negative prompts are required");
for (const item of [...(evals.positive || [])]) {
  if (!item.id || !item.prompt || !item.expectedTool || !item.expectedSkill) errors.push(`${item.id || "positive"}: incomplete positive case`);
}
for (const item of [...(evals.negative || [])]) {
  if (!item.id || !item.prompt || !item.expectedBehaviour) errors.push(`${item.id || "negative"}: incomplete negative case`);
}
const requiredModes = ["chatgpt_alone", "chatgpt_with_opstruth", "npx_opstruth", "manual_review", "website"];
const requiredMetrics = ["evidence_accuracy", "unknown_detection", "false_confidence_resistance", "actionability", "elapsed_time", "corrections_required", "repeat_usefulness"];
if (matrix.schemaVersion !== "1.0.0" || matrix.status !== "protocol_ready_unmeasured") errors.push("product value matrix must remain explicitly unmeasured before evaluation");
if (JSON.stringify(matrix.modes) !== JSON.stringify(requiredModes)) errors.push("product value comparison modes mismatch");
if (JSON.stringify(matrix.metrics) !== JSON.stringify(requiredMetrics)) errors.push("product value metrics mismatch");
if (!Array.isArray(matrix.cases) || matrix.cases.length < 12) errors.push("product value matrix requires at least twelve cases");
if (matrix.privacy?.storeRepositoryIdentifiers !== false || matrix.privacy?.storeUrls !== false || matrix.privacy?.storePrompts !== false || matrix.privacy?.storeUserIdentifiers !== false || matrix.privacy?.allowFreeText !== false) {
  errors.push("product value matrix privacy boundary mismatch");
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`evaluation validation passed: ${evals.positive.length} positive, ${evals.negative.length} negative, ${matrix.cases.length} controlled cases`);
