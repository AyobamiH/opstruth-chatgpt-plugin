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

## Repository-owned agent foundations

Start with [project knowledge](.agents/knowledge/README.md) and the [Secure API Delivery skill](.agents/skills/secure-api-delivery/SKILL.md). Open these files directly if your agent does not discover checkout skills automatically. They are versioned here and require no personal skill installation. Preserve all existing project-specific instructions and deeper directory rules.

For every development task, apply the skill scope/evidence review before editing. For documentation-only work, record why API/runtime checks are not applicable; never equate documentation checks with production security. The skill does not authorise live scans, credentials, publishing or deployment.

Update the relevant knowledge in the same change when architecture, behavior, commands or boundaries change. Keep verified rationale and lessons with source links; do not store raw chats, secrets or unverified live status. Existing release, ownership and approval gates remain in force.

Requires Python 3.9 or newer. Run `python3 .agents/check-foundations.py` for the required skill files, AGENTS/README discovery pointers and Markdown links in those files and the knowledge entry point. This lightweight check is not a CI gate or an application/security test.
Run `python3 .agents/test-foundations.py` for isolated negative discovery fixtures.
