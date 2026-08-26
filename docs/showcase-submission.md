# Developer showcase draft

## Title

OpsTruth: evidence-first verification for coding work

## Short description

OpsTruth helps ChatGPT and Codex distinguish what a public repository proves from what remains unverified. It maps repositories, reads current public CI evidence, traces routes and contracts, probes explicitly supplied HTTPS health endpoints and verifies signed evidence without changing target systems.

## What is new in 0.3.1

The release adds privacy-safe aggregate usage analytics, deployed-commit identity in health responses, post-deploy smoke tests, pinned CI actions, exact Wrangler versioning, explicit discovery boundaries and a golden prompt evaluation set. Analytics are intentionally limited to tool, outcome, latency, version and coarse client family. No prompts, repository names, URLs, IPs or user identifiers are stored.

## Example workflow

Ask: “Before I ship this public repository, check whether the latest commit passed CI and whether the deployment has a public health response.” OpsTruth selects the narrowest read-only checks, cites the exact public evidence, separates verified facts from warnings and proof gaps, and stops before any write or execution action.

## Links

- Plugin: https://github.com/AyobamiH/opstruth-chatgpt-plugin
- MCP: https://opstruth-chatgpt.woeinvests.workers.dev/mcp
- Privacy: https://opstruth-chatgpt.woeinvests.workers.dev/privacy
- Support: https://opstruth-chatgpt.woeinvests.workers.dev/support
