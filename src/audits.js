import { declaredEnvironmentNames, fileContents, fileMap, paths } from "./github.js";
import { bounded, unique } from "./utils.js";
import { PLUGIN_VERSION } from "./version.js";

const SOURCE_VERSION = PLUGIN_VERSION;

function report(snapshot, skill) {
  return {
    contractVersion: "1.0.0",
    skill: { name: skill, version: SOURCE_VERSION },
    repository: snapshot.repository,
    status: "complete",
    verdict: {
      code: "insufficient_evidence",
      label: "Insufficient evidence",
      summary: "This is read-only public evidence; it does not prove fresh execution, runtime correctness or deployment readiness.",
    },
    confidence: {
      level: snapshot.limits.treeTruncated ? "medium" : "high",
      reason: snapshot.limits.treeTruncated
        ? "GitHub reported a truncated repository tree."
        : "Repository identity and the bounded public tree were inspected.",
    },
    verified: [],
    warnings: snapshot.limits.treeTruncated ? ["GitHub truncated the recursive tree response."] : [],
    failures: [],
    skipped: [],
    notVerified: [
      "Local working-tree state",
      "Fresh build and test execution by OpsTruth",
      "Runtime behavior",
      "Private CI and provider configuration",
    ],
    evidence: [],
    changedState: { changed: false, summary: "Read-only public GitHub inspection only." },
  };
}

function packageJson(snapshot) {
  const text = fileMap(snapshot).get("package.json");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function packageScripts(snapshot) {
  const pkg = packageJson(snapshot);
  return pkg && pkg.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts).sort() : [];
}

function evidencePath(summary, evidence) {
  return { summary, evidence: Array.isArray(evidence) ? evidence : [evidence] };
}

export function inspectRepository(snapshot) {
  const result = report(snapshot, "repo-map");
  const allPaths = paths(snapshot);
  const topLevel = unique(allPaths.map((path) => path.split("/")[0])).sort();
  const manifests = allPaths.filter((path) => /(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|composer\.json)$/i.test(path));
  const workflows = allPaths.filter((path) => path.startsWith(".github/workflows/"));
  const migrations = allPaths.filter((path) => /(?:^|\/)migrations?\//i.test(path));
  const tests = allPaths.filter((path) => /(?:^|\/)(?:test|tests|__tests__)\//i.test(path) || /\.(?:test|spec)\.[^.]+$/i.test(path));
  result.map = {
    topLevel: bounded(topLevel, 100),
    manifests: bounded(manifests, 100),
    workflows: bounded(workflows, 100),
    migrations: bounded(migrations, 100),
    tests: bounded(tests, 100),
    packageScriptNames: packageScripts(snapshot),
  };
  result.verified.push("Public repository identity", "Default branch", "Bounded repository tree", "Visible manifests and workflow paths");
  result.evidence.push(evidencePath("Repository metadata", snapshot.repository.htmlUrl));
  result.evidence.push(evidencePath("Tree identity", snapshot.repository.headTreeSha || "GitHub tree response"));
  return result;
}

export function auditEnvironment(snapshot) {
  const result = report(snapshot, "env-audit");
  const allPaths = paths(snapshot);
  const envFiles = allPaths.filter((path) => /(?:^|\/)\.env(?:\.|$)/i.test(path));
  const configs = allPaths.filter((path) => /(?:^|\/)(?:wrangler\.(?:toml|jsonc?)|vercel\.json|netlify\.toml|dockerfile|compose\.ya?ml|tsconfig\.json)$/i.test(path));
  result.environment = {
    referencedVariableNames: declaredEnvironmentNames(snapshot),
    visibleEnvironmentFilePaths: bounded(envFiles, 100),
    configurationFiles: bounded(configs, 100),
    packageScriptNames: packageScripts(snapshot),
  };
  result.verified.push("Environment variable names referenced in inspected source", "Visible environment and platform configuration paths");
  if (envFiles.length) result.warnings.push("Environment-style files are tracked. Their contents were deliberately not read.");
  result.skipped.push("Environment file contents and all environment values");
  result.evidence.push(evidencePath("Inspected source files", snapshot.files.map((file) => file.path)));
  return result;
}

const SECRET_PATTERNS = [
  ["private-key-material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["github-token-shape", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ["aws-access-key-shape", /\bAKIA[A-Z0-9]{16}\b/g],
  ["slack-token-shape", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ["generic-secret-assignment", /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'${\n]{12,}["']/gi],
];

export function auditSecrets(snapshot) {
  const result = report(snapshot, "secret-audit");
  const allPaths = paths(snapshot);
  const excludedSecretFiles = allPaths.filter((path) => /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|keystore)$/i.test(path));
  const findings = [];
  for (const file of fileContents(snapshot)) {
    for (const [kind, pattern] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of file.text.matchAll(pattern)) {
        const line = file.text.slice(0, match.index).split("\n").length;
        findings.push({ kind, path: file.path, line, preview: "[REDACTED]" });
        if (findings.length >= 100) break;
      }
      if (findings.length >= 100) break;
    }
  }
  const deduplicated = [...new Map(findings.map((finding) => [`${finding.path}:${finding.line}`, finding])).values()];
  result.secretRisk = { findings: deduplicated, excludedSecretFilePaths: bounded(excludedSecretFiles, 100), valuesReturned: false };
  result.verified.push("Bounded inspected source was checked for selected secret shapes", "Matched values were not returned");
  if (deduplicated.length) result.warnings.push(`${deduplicated.length} secret-like location(s) require human review.`);
  if (excludedSecretFiles.length) result.warnings.push("Secret-bearing file paths are visible in the tree and were not opened.");
  result.notVerified.push("Whether a pattern match is an active credential", "Repository history outside the inspected default-branch tree");
  result.evidence.push(evidencePath("Redacted secret-risk locations", deduplicated.map((item) => `${item.path}:${item.line}:${item.kind}`)));
  return result;
}

function routeFromFile(path) {
  const normalized = path.replace(/^src\//, "");
  let match = normalized.match(/^app\/(?:(.*)\/)?(page|route)\.(?:js|jsx|ts|tsx)$/);
  if (match) {
    const clean = String(match[1] || "").split("/").filter((part) => part && !/^\(.+\)$/.test(part)).join("/");
    return { path: `/${clean}`.replace(/\/+/g, "/"), kind: match[2] === "route" ? "api-handler" : "page", source: path };
  }
  match = normalized.match(/^pages\/(.*)\.(?:js|jsx|ts|tsx)$/);
  if (match && !/^_(?:app|document|error)$/.test(match[1])) {
    const clean = match[1].replace(/\/index$/, "");
    return { path: `/${clean}`.replace(/\/+/g, "/"), kind: clean.startsWith("api/") ? "api-handler" : "page", source: path };
  }
  return null;
}

function normalizedRoute(value) {
  const route = String(value || "").trim();
  if (!route.startsWith("/") || route.startsWith("//") || route.length > 240) return null;
  return route.replace(/\/{2,}/g, "/");
}

function extractedRoutes(file) {
  const routes = [];
  const add = (path, kind, method = null) => {
    const normalized = normalizedRoute(path);
    if (normalized) routes.push({ path: normalized, kind, ...(method ? { method } : {}), source: file.path });
  };

  const methodPattern = /\b(?:app|router|server|api|fastify|hono)\s*\.\s*(get|post|put|patch|delete|options|head|all|use)\s*\(\s*(["'`])([^"'`\r\n]+)\2/g;
  for (const match of file.text.matchAll(methodPattern)) add(match[3], "http-handler", match[1].toUpperCase());

  const chainedPattern = /\b(?:app|router|server|api|fastify|hono)\s*\.\s*route\s*\(\s*(["'`])([^"'`\r\n]+)\1\s*\)\s*\.\s*(get|post|put|patch|delete|options|head|all)/g;
  for (const match of file.text.matchAll(chainedPattern)) add(match[2], "http-handler", match[3].toUpperCase());

  for (const match of file.text.matchAll(/<Route\b[^>]*\bpath\s*=\s*(["'])([^"']+)\1/g)) add(match[2], "declared-route");
  for (const match of file.text.matchAll(/\bpath\s*=\s*(["'])([^"']+)\1/g)) add(match[2], "declared-route");

  if (/(?:openapi|swagger)/i.test(file.path)) {
    for (const match of file.text.matchAll(/(["'])(\/[^"'\r\n]+)\1\s*:/g)) add(match[2], "contract-route");
  }
  return routes;
}

export function staticRoutes(snapshot) {
  const fileRoutes = paths(snapshot).map(routeFromFile).filter(Boolean);
  const declaredRoutes = fileContents(snapshot).flatMap(extractedRoutes);
  return [...new Map([...fileRoutes, ...declaredRoutes].map((route) => [
    `${route.method || "ANY"}:${route.path}:${route.source}`,
    route,
  ])).values()];
}

export function traceRoutes(snapshot) {
  const result = report(snapshot, "route-trace");
  result.routes = bounded(staticRoutes(snapshot), 250);
  result.verified.push("Statically visible file-system, Express-style, router and contract route patterns");
  if (!result.routes.length) result.warnings.push("No route patterns were found in the bounded source selection.");
  result.notVerified.push("Route reachability", "Middleware effects", "Authentication behavior", "Live responses");
  result.evidence.push(evidencePath("Route sources", result.routes.map((route) => route.source)));
  return result;
}

export function reviewApiContracts(snapshot) {
  const result = report(snapshot, "api-contract-audit");
  const allPaths = paths(snapshot);
  const contracts = allPaths.filter((path) => /(?:openapi|swagger|graphql|schema|contract)/i.test(path) && /\.(?:json|ya?ml|graphql|gql|ts|js)$/i.test(path));
  const routeSources = staticRoutes(snapshot).filter((route) => route.kind === "http-handler" || route.kind === "api-handler")
    .map((route) => route.source);
  const handlers = unique([
    ...allPaths.filter((path) => /(?:^|\/)(?:api\/|route\.(?:js|jsx|ts|tsx)$)/i.test(path)),
    ...routeSources,
  ]);
  result.apiContracts = { contracts: bounded(contracts, 150), handlers: bounded(handlers, 200) };
  result.verified.push("Visible API contract and handler paths");
  if (handlers.length && !contracts.length) result.warnings.push("API handlers are visible but no explicit contract artifact was detected.");
  result.notVerified.push("Deployed API behavior", "Backward compatibility", "Consumer conformance");
  result.evidence.push(evidencePath("Contract paths", contracts));
  result.evidence.push(evidencePath("Handler paths", handlers));
  return result;
}

export function reviewMigrations(snapshot) {
  const result = report(snapshot, "migration-review");
  const migrationFiles = fileContents(snapshot).filter((file) => /(?:^|\/)migrations?\//i.test(file.path) || /migration/i.test(file.path));
  const riskPatterns = [
    ["drop-operation", /\bDROP\s+(?:TABLE|COLUMN|DATABASE|SCHEMA)\b/i],
    ["row-security-disabled", /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i],
    ["security-definer", /\bSECURITY\s+DEFINER\b/i],
    ["alter-operation", /\bALTER\s+TABLE\b/i],
  ];
  const indicators = [];
  for (const file of migrationFiles) {
    for (const [kind, pattern] of riskPatterns) if (pattern.test(file.text)) indicators.push({ kind, path: file.path });
  }
  result.migrations = {
    files: migrationFiles.map((file) => file.path),
    riskIndicators: indicators,
  };
  result.verified.push("Visible migration paths and selected static risk indicators");
  if (indicators.length) result.warnings.push("Migration risk indicators require ordering, backup and compatibility review.");
  result.notVerified.push("Applied migration state", "Database backup", "Rollback viability", "Production data compatibility");
  result.evidence.push(evidencePath("Migration files", result.migrations.files));
  return result;
}

export function checkGithubHandoff(snapshot) {
  const result = report(snapshot, "github-handoff");
  const allPaths = paths(snapshot);
  const workflows = allPaths.filter((path) => path.startsWith(".github/workflows/"));
  const licenceFiles = allPaths.filter((path) => /(?:^|\/)licen[cs]e(?:\.|$)/i.test(path));
  const externalLicenceFiles = licenceFiles.filter((path) => /(?:^|\/)(?:node_modules|vendor|third[_-]?party|openai-cookbook|openclaw-docs|cookbook)(?:\/|$)/i.test(path));
  const projectLicenceFiles = licenceFiles.filter((path) => !externalLicenceFiles.includes(path));
  const githubSpdx = snapshot.repository.license || null;
  const licenceStatus = githubSpdx && projectLicenceFiles.length ? "consistent"
    : githubSpdx ? "metadata_only"
      : projectLicenceFiles.length ? "tree_only" : "absent";
  const githubStatus = snapshot.githubStatus || null;
  const signals = {
    workflows,
    contributing: allPaths.some((path) => /(?:^|\/)contributing\.md$/i.test(path)),
    pullRequestTemplate: allPaths.some((path) => /pull_request_template/i.test(path)),
    securityPolicy: allPaths.some((path) => /(?:^|\/)security\.md$/i.test(path)),
    licence: {
      present: Boolean(githubSpdx || projectLicenceFiles.length),
      githubSpdx,
      detectedFiles: bounded(projectLicenceFiles, 20),
      ignoredExternalFiles: bounded(externalLicenceFiles, 20),
      status: licenceStatus,
    },
    packageScriptNames: packageScripts(snapshot),
    publicGithubStatus: githubStatus,
  };
  result.githubHandoff = signals;
  result.verified.push("Visible GitHub workflow and handoff files", "Package script names");
  if (!workflows.length) result.warnings.push("No GitHub Actions workflow was visible.");
  if (!signals.pullRequestTemplate) result.warnings.push("No pull request template was visible.");
  if (licenceStatus === "tree_only") result.warnings.push("A licence file is visible, but GitHub did not report a recognised SPDX licence.");
  if (licenceStatus === "metadata_only") result.warnings.push("GitHub reports a licence, but no licence file was visible in the bounded tree.");

  if (githubStatus?.workflowRuns?.available) {
    result.verified.push("Latest public GitHub Actions workflow evidence");
    const latest = githubStatus.workflowRuns.latest || [];
    const nonPassing = latest.filter((run) => run.status !== "completed" || (run.conclusion && !["success", "neutral", "skipped"].includes(run.conclusion)));
    if (!latest.length) result.warnings.push("GitHub reported no public workflow runs for the default branch.");
    if (nonPassing.length) result.warnings.push(`${nonPassing.length} recent public workflow run(s) are incomplete or not passing.`);
  } else result.notVerified.push("Latest public workflow result");

  if (githubStatus?.checkRuns?.available) result.verified.push("Current default-branch check-run evidence");
  else result.notVerified.push("Current default-branch check runs");

  if (githubStatus?.commitStatus?.available) result.verified.push("Current default-branch combined commit status");
  else result.notVerified.push("Current default-branch combined commit status");

  if (githubStatus?.branchProtection?.available) {
    result.verified.push("Default-branch protection flag");
    if (!githubStatus.branchProtection.protected) result.warnings.push("GitHub reports that the default branch is not protected.");
  } else result.notVerified.push("Branch protection");
  result.notVerified.push("Review approvals", "Unpushed local commits");
  result.evidence.push(evidencePath("Workflow paths", workflows));
  if (githubStatus?.workflowRuns?.latest?.length) {
    result.evidence.push(evidencePath("Recent public workflow runs", githubStatus.workflowRuns.latest.map((run) => run.htmlUrl || `${run.name}:${run.conclusion || run.status}`)));
  }
  return result;
}

export function checkDeployment(snapshot) {
  const result = report(snapshot, "deployment-preflight");
  const allPaths = paths(snapshot);
  const configs = allPaths.filter((path) => /(?:^|\/)(?:wrangler\.(?:toml|jsonc?)|vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml|dockerfile|compose\.ya?ml|railway\.json)$/i.test(path));
  const platforms = [];
  for (const path of configs) {
    if (/wrangler/i.test(path)) platforms.push("Cloudflare");
    if (/vercel/i.test(path)) platforms.push("Vercel");
    if (/netlify/i.test(path)) platforms.push("Netlify");
    if (/docker|compose/i.test(path)) platforms.push("Container");
    if (/fly/i.test(path)) platforms.push("Fly.io");
    if (/render/i.test(path)) platforms.push("Render");
    if (/railway/i.test(path)) platforms.push("Railway");
  }
  const scripts = packageScripts(snapshot).filter((name) => /deploy|release|publish|build|preview/i.test(name));
  result.deployment = { configurationFiles: bounded(configs, 100), platforms: unique(platforms), packageScriptNames: scripts };
  result.verified.push("Visible deployment configuration paths, platform indicators and script names");
  if (!configs.length) result.warnings.push("No recognised deployment configuration was visible in the bounded tree.");
  result.notVerified.push("Credential availability", "Provider project binding", "Build success", "Live deployment health");
  result.evidence.push(evidencePath("Deployment configuration", configs));
  return result;
}

export function fullAudit(snapshot) {
  const result = report(snapshot, "audit");
  const sections = {
    repository: inspectRepository(snapshot),
    environment: auditEnvironment(snapshot),
    secrets: auditSecrets(snapshot),
    routes: traceRoutes(snapshot),
    apiContracts: reviewApiContracts(snapshot),
    migrations: reviewMigrations(snapshot),
    githubHandoff: checkGithubHandoff(snapshot),
    deployment: checkDeployment(snapshot),
  };
  result.sections = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, {
    status: value.status,
    verified: value.verified,
    warnings: value.warnings,
  }]));
  result.verified = unique(Object.values(sections).flatMap((section) => section.verified));
  result.warnings = unique(Object.values(sections).flatMap((section) => section.warnings));
  result.failures = unique(Object.values(sections).flatMap((section) => section.failures));
  result.skipped = unique(Object.values(sections).flatMap((section) => section.skipped));
  result.notVerified = unique(Object.values(sections).flatMap((section) => section.notVerified));
  result.details = {
    map: sections.repository.map,
    environment: sections.environment.environment,
    secretRisk: sections.secrets.secretRisk,
    routes: sections.routes.routes,
    apiContracts: sections.apiContracts.apiContracts,
    migrations: sections.migrations.migrations,
    githubHandoff: sections.githubHandoff.githubHandoff,
    deployment: sections.deployment.deployment,
  };
  result.evidence = unique(Object.values(sections).flatMap((section) => section.evidence).map((entry) => JSON.stringify(entry)))
    .map((entry) => JSON.parse(entry));
  result.verdict = result.failures.length
    ? { code: "not_ready", label: "Not ready", summary: "Blocking evidence failures remain." }
    : result.warnings.length
      ? { code: "insufficient_evidence", label: "Insufficient evidence", summary: "Warnings or proof gaps remain; validate them before release." }
      : { code: "ready_for_live_validation", label: "Ready for live validation", summary: "Public evidence is internally consistent enough for the next approved validation step; it is not a production approval." };
  return result;
}
