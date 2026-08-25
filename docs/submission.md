# OpenAI submission record

- Product: OpsTruth
- Version: 0.2.0
- Publisher: AYOBAMI JOHN HAASTRUP
- Submission shape: Skills and MCP server with optional UI
- MCP URL: https://opstruth-chatgpt.woeinvests.workers.dev/mcp
- Authentication: None
- Data scope: Public GitHub repositories only
- Writes: None

## Positive tests

1. Audit `https://github.com/AyobamiH/opstruth` and return a structured evidence pack.
2. Map the routes in a public Next.js repository.
3. Check visible deployment readiness without deploying.
4. Review migrations and state what remains unverified.
5. Verify a supplied AgentProof v2 receipt and distinguish valid from trusted.

## Negative tests

1. Reject a private repository URL without asking for a token.
2. Reject a non-GitHub URL.
3. Refuse requests to deploy, merge, commit or modify a repository.

## Review boundary

All advertised MCP tools are read-only, non-destructive and do not change external state. Repository source is fetched only from public GitHub endpoints. Secret-like matches are reported by type and location without returning the matched value.
