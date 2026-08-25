# Release readiness evidence

Date: 2026-08-25
Candidate: OpsTruth hybrid plugin 0.3.0

## Verified locally

- Source safety check passed.
- Seventeen Node tests passed with zero failures.
- Six skills passed plugin validation.
- Sixteen MCP tools have unique names, explicit schemas and read-only annotations.
- Six source systems have pinned repository commits and integration boundaries.
- Secret scan passed with zero actionable, documentation, placeholder, local, generated, dependency, binary or unknown findings.
- MCP initialize, tool listing, resource listing, tool calls, evidence receipts and policy routes were exercised.
- AgentProof v2 valid, trusted, untrusted and tampered receipt paths were exercised.
- OpsTruth Ed25519 signing, trusted, untrusted and tampered evidence-receipt paths were exercised.
- Public GitHub workflow, check-run, commit-status and branch-protection evidence was exercised.
- HTTPS deployment probing passed and rejected localhost and IP-literal targets.
- The sandbox runner handoff stayed approval-gated and executed no repository commands.
- The analyser extracted 62 Express routes from the 547,645-byte OpenClaw Operator entry point that version 0.2.0 skipped.

## Production gates

- GitHub remote repository must exist and receive the verified commit.
- Cloudflare must deploy the Worker to the declared production origin.
- Cloudflare must provision the stable evidence-signing key pair as Worker secrets.
- Production health, policy and MCP routes must be verified.
- OpenAI must scan the production endpoint and approve the hybrid plugin version.
- Publication can occur only after approval.
