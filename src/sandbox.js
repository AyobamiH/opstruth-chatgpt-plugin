import { fileMap, paths } from "./github.js";
import { sha256, stableJson, unique } from "./utils.js";
import { PLUGIN_VERSION } from "./version.js";

function packageScripts(snapshot) {
  const text = fileMap(snapshot).get("package.json");
  if (!text) return [];
  try {
    const scripts = JSON.parse(text)?.scripts;
    return scripts && typeof scripts === "object" ? Object.keys(scripts).filter((name) => /^[A-Za-z0-9:_-]{1,80}$/.test(name)) : [];
  } catch {
    return [];
  }
}

function rankedScriptNames(names) {
  const preference = ["verify:main", "verify", "check", "typecheck", "test", "lint", "build"];
  return unique([
    ...preference.filter((name) => names.includes(name)),
    ...names.filter((name) => /^(?:verify|check|typecheck|test|lint|build)(?::|$)/.test(name)).sort(),
  ]).slice(0, 12);
}

export async function prepareSandboxVerification(snapshot, objective = null) {
  const allPaths = paths(snapshot);
  const scripts = rankedScriptNames(packageScripts(snapshot));
  const packageManager = allPaths.includes("pnpm-lock.yaml") ? "pnpm"
    : allPaths.includes("yarn.lock") ? "yarn"
      : allPaths.includes("bun.lockb") || allPaths.includes("bun.lock") ? "bun" : "npm";
  const commands = scripts.map((name) => ({
    id: `package-script:${name}`,
    source: "declared-package-script",
    display: packageManager === "yarn" ? `yarn ${name}` : `${packageManager} run ${name}`,
    scriptName: name,
  }));
  const plan = {
    schema: "opstruth.sandbox-verification-plan",
    schemaVersion: "1.0.0",
    objective: String(objective || "Verify the repository build, tests and declared checks."),
    repository: {
      fullName: snapshot.repository.fullName,
      url: snapshot.repository.htmlUrl,
      defaultBranch: snapshot.repository.defaultBranch,
      headCommitSha: snapshot.repository.headCommitSha || null,
    },
    packageManager,
    commands,
    authority: "execute_untrusted_repository_code",
    approval: {
      required: true,
      scope: "Every command and the exact repository commit must be shown to the user before execution.",
      granted: false,
    },
    runner: {
      availableInPublicPlugin: false,
      requiredCapabilities: [
        "ephemeral isolated filesystem",
        "bounded CPU, memory and wall time",
        "network disabled by default after dependency acquisition",
        "no inherited credentials or provider sessions",
        "captured exit codes, logs and artifact digests",
        "AgentProof-compatible signed result receipt",
      ],
    },
    boundaries: [
      "This tool prepares a runner handoff and does not execute commands.",
      "Only repository-declared package scripts are included.",
      "A separately connected authenticated runner must enforce approval and isolation.",
    ],
  };
  return {
    contractVersion: "1.0.0",
    skill: { name: "sandbox-verification-handoff", version: PLUGIN_VERSION },
    status: commands.length ? "ready_for_approval" : "insufficient_declared_commands",
    plan: { ...plan, digest: await sha256(stableJson(plan)) },
    verified: commands.length ? ["Repository-declared verification script names", "Immutable repository identity for runner handoff"] : ["Immutable repository identity for runner handoff"],
    warnings: commands.length ? [] : ["No recognised verification package scripts were visible in the bounded source selection."],
    failures: [],
    skipped: ["Command execution", "Dependency installation", "Credential injection"],
    notVerified: ["Build success", "Test success", "Runtime behavior"],
    evidence: [{ summary: "Declared runner command candidates", evidence: commands.map((command) => command.display) }],
    changedState: { changed: false, summary: "Runner handoff planning only." },
  };
}
