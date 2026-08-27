# Agent Instructions

- Treat this repository as the independent public OpsTruth ChatGPT plugin.
- Treat `docs/architecture/BOUNDARIES.md` as the authority constitution for this repository.
- Do not edit, remediate, deploy, commit to, or otherwise mutate a system that OpsTruth is inspecting.
- All OpsTruth tools that inspect external or user-controlled systems MUST remain non-mutating.
- Do not add repository write, remediation, target-deployment execution, approval, or other target-mutation tools to this project.
- Put capabilities that require target-system mutation in a separately authorised execution plane.
- Authenticated private-repository support is permitted only with brokered, least-privilege read access. Never expose credentials to MCP tool arguments, reports, logs, analytics, or receipts.
- Never accept credentials, tokens, private keys, or secret values as tool inputs.
- Treat execution receipts as claims to verify, not proof that an outcome occurred.
- Keep executor and verifier identities, signing keys, authority, and audit records separate.
- Repository-maintenance automation is governed by `docs/maintainers/BOT.md`. Any future write authority is limited to this OpsTruth source repository. It MUST NOT approve its own changes or alter protected governance files autonomously.
- Preserve source repository, version, commit, licence, adaptation and verification status in `provenance/sources.json`.
- Run `npm run check:boundaries` after changing tools, tool schemas, network behavior, contracts, workflows, credentials, or deployment behavior.
- Run `npm run check` before any push or deployment.
- Test the deployed `/health`, `/mcp`, `/privacy`, `/terms` and `/support` routes before submission.
- Treat OpenAI approval as distinct from deployment and publication.
- Never claim publication until the directory version is visibly published.
