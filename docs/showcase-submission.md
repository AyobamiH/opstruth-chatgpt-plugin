# Developer showcase draft

## Title

OpsTruth: evidence-first verification for coding work

## Short description

OpsTruth helps ChatGPT and Codex distinguish what a public repository proves from what remains unverified. It binds repositories, commits, CI, runtime observations and execution receipts into portable signed evidence without changing target systems.

## What is new in 0.4.0

Evidence Graph v1 connects exact repository, commit and CI identities, preserves contradictions and returns caller-held signed snapshots. Users can compare compatible snapshots to see state changes or independently verify a signed executor receipt against fresh public evidence. Analytics v2 and optional feedback remain aggregate and reason-coded, with no prompts, repositories, URLs, graphs, receipts or user identifiers retained.

## Example workflow

Ask: “Bind this repository, current CI and health endpoint into one signed snapshot, then compare it with the previous snapshot.” OpsTruth verifies subject compatibility, reports exact changes and contradictions, identifies proof gaps and stops before any write or execution action.

## Links

- Plugin: https://github.com/AyobamiH/opstruth-chatgpt-plugin
- MCP: https://opstruth-chatgpt.woeinvests.workers.dev/mcp
- Privacy: https://opstruth-chatgpt.woeinvests.workers.dev/privacy
- Support: https://opstruth-chatgpt.woeinvests.workers.dev/support
