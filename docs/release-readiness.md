# Release readiness evidence

Date: 2026-08-25
Candidate: OpsTruth hybrid plugin 0.2.0

## Verified locally

- Source safety check passed.
- Eleven Node tests passed with zero failures.
- Six skills passed plugin validation.
- Thirteen MCP tools have unique names, explicit schemas and read-only annotations.
- Six source systems have pinned repository commits and integration boundaries.
- Secret scan passed with zero actionable, documentation, placeholder, local, generated, dependency, binary or unknown findings.
- MCP initialize, tool listing, resource listing, tool calls, evidence receipts and policy routes were exercised.
- AgentProof v2 valid, trusted, untrusted and tampered receipt paths were exercised.

## Production gates

- GitHub remote repository must exist and receive the verified commit.
- Cloudflare must deploy the Worker to the declared production origin.
- Production health, policy and MCP routes must be verified.
- OpenAI must scan the production endpoint and approve the hybrid plugin version.
- Publication can occur only after approval.
