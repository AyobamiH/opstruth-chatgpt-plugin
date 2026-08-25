# Agent Instructions

- Treat this repository as the independent public OpsTruth ChatGPT plugin.
- Do not edit source repositories to make this plugin pass.
- Keep public MCP tools read-only unless a separately reviewed authenticated action lane is added.
- Never accept credentials, tokens, private keys, or secret values as tool inputs.
- Preserve source repository, version, commit, licence, adaptation and verification status in `provenance/sources.json`.
- Run `npm run check` before any push or deployment.
- Test the deployed `/health`, `/mcp`, `/privacy`, `/terms` and `/support` routes before submission.
- Treat OpenAI approval as distinct from deployment and publication.
- Never claim publication until the directory version is visibly published.
