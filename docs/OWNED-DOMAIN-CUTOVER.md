# Owned-domain cutover evidence

Observed: 2026-08-30

OpsTruth MCP is canonically served at `https://mcp.opstruth.io/mcp`.

- implementation PR: [#7](https://github.com/AyobamiH/opstruth-chatgpt-plugin/pull/7)
- merge commit: [`915ab91110bddf520551b318723baac49213e33a`](https://github.com/AyobamiH/opstruth-chatgpt-plugin/commit/915ab91110bddf520551b318723baac49213e33a)
- pull-request CI: [33299933644](https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33299933644) — success
- independent maintainer review: [33299933712](https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33299933712) — success
- post-merge CI: [33300000121](https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33300000121) — success
- deployment: [33300000143](https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33300000143) — success
- deployment job: `99226220511`
- Cloudflare version: `4a5ef5ed-fad8-48a4-9d2b-5eaeb4ad4bfe`

The deployment log records the custom domain, exact source commit, version `0.4.0`, 21 read-only tools, and successful production smoke with a signed Evidence Graph. The compatibility `workers.dev` endpoint remains available but is not the canonical documented transport.

A live browser observation after deployment loaded `https://mcp.opstruth.io/` and displayed the canonical MCP endpoint, signing key, privacy, terms, and support links.

This cutover does not cause OpsTruth to execute, mutate, deploy, merge, or certify its own target changes. Its public authority remains read-only evidence observation and signature verification.
