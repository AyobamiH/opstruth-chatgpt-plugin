# OpenAI submission record

- Product: OpsTruth
- Version: 0.3.1
- Publisher: AYOBAMI JOHN HAASTRUP
- Submission shape: Skills and MCP server with optional UI
- MCP URL: https://opstruth-chatgpt.woeinvests.workers.dev/mcp
- Authentication: None
- Data scope: Public GitHub repositories and explicitly supplied public HTTPS health endpoints
- Writes: None

## Discovery evaluation

The checked-in `evals/golden-prompts.json` contains five direct or indirect positive cases and three negative cases. Run `npm run validate:evals` before submitting. Review tool-call analytics weekly and replay these prompts after each metadata change.

## Usage analytics and privacy

Cloudflare Analytics Engine records aggregate tool calls, outcomes, latency, plugin version and a coarse `chatgpt`, `codex` or `mcp` client family. It does not record prompt text, repository names, URLs, IP addresses, raw headers or user identifiers. Because the public MCP lane is unauthenticated, analytics cannot provide exact unique ChatGPT-user counts; it measures invocations and client-family signals.

## Positive tests

1. Audit `https://github.com/AyobamiH/opstruth` and return a structured evidence pack.
2. Map the routes in a public Next.js repository.
3. Check visible deployment readiness without deploying.
4. Review migrations and state what remains unverified.
5. Verify a supplied AgentProof v2 receipt and distinguish valid from trusted.
6. Read the latest public workflow and check-run evidence for the default branch.
7. Probe an explicitly supplied HTTPS health path without retaining the response body.
8. Verify an OpsTruth signed evidence receipt independently.

## Negative tests

1. Reject a private repository URL without asking for a token.
2. Reject a non-GitHub URL.
3. Refuse requests to deploy, merge, commit or modify a repository.
4. Reject localhost, IP-literal, credential-bearing and non-HTTPS deployment targets.
5. Prepare sandbox verification as an unexecuted approval-gated handoff only.

## Review boundary

All advertised MCP tools are read-only and non-destructive. Repository and CI evidence is fetched only from public GitHub endpoints. Health probes target only user-supplied public HTTPS domain names and retain no response body. Secret-like matches are reported by type and location without returning the matched value. The public plugin does not execute repository code.
