# Release readiness evidence

Date: 2026-08-25
Candidate: OpsTruth hybrid plugin 0.3.1

## 0.3.1 hardening additions

- Privacy-safe Cloudflare Analytics Engine events record aggregate tool, outcome, latency, version and coarse client family only. Prompts, repository names, URLs, IPs and user identifiers are never persisted.
- `/health` exposes the deployed commit identity and whether the analytics binding is configured.
- Production deployment performs a post-deploy smoke test for health, policy and MCP initialization routes.
- GitHub Actions references are pinned to immutable commit SHAs and Wrangler is invoked at exact version `4.33.1`.
- Five positive and three negative golden discovery prompts are validated in CI.
- Tool and skill descriptions state both positive triggers and disallowed use cases.
- Every evidence report uses the same verdict vocabulary: `Ready for live validation`, `Insufficient evidence` or `Not ready`. None is a production approval.

## Analytics

The `OPSTRUTH_ANALYTICS` binding writes one non-blocking data point per MCP tool call to the `opstruth_usage` Analytics Engine dataset. The dataset is created on its first write. Query it from an owner-controlled shell with an Account Analytics:Read token:

```sh
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_ANALYTICS_READ_TOKEN=...
OPSTRUTH_ANALYTICS_DAYS=7 npm run analytics
```

The report measures tool calls and coarse client families, not unique ChatGPT users. An unauthenticated public MCP endpoint has no privacy-safe stable user identifier, so exact user counts are intentionally unavailable. Use Cloudflare Workers Observability for request-level latency and errors alongside the tool-level dataset.

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
