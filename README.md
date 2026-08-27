# OpsTruth for ChatGPT and Codex

OpsTruth is an evidence-first repository verification plugin. It combines focused workflow skills, a read-only MCP server, deterministic GitHub repository inspection, current public CI evidence, bounded HTTPS deployment probes, capability routing, signed evidence receipts, AgentProof verification and an optional evidence report UI.

The public release accepts public GitHub repository URLs and explicitly supplied public HTTPS deployment URLs. It does not clone repositories, execute project code, install packages, read private repositories, deploy projects or mutate target systems. Fresh execution is represented by an approval-gated handoff contract for a separately connected isolated runner.

Usage analytics are privacy-safe and aggregate-only. The Worker records tool name, outcome, latency, version and a coarse client family in Cloudflare Analytics Engine. It never records prompts, repository names, URLs, IPs or user identifiers. See `docs/release-readiness.md` for owner-only queries and the limitations of estimating ChatGPT usage.

## Architecture

- `skills/` teaches ChatGPT and Codex when and how to use the tools.
- `src/` implements the stateless Cloudflare Worker and MCP endpoint.
- `provenance/sources.json` pins the repositories and commits that informed each capability.
- `worker-ui/` documents the embedded evidence view.
- `test/` verifies protocol, safety and audit behavior.

OpsTruth deliberately separates observation from mutation. Private systems may later be inspected through brokered least-privilege read access. Repository writes, remediation, deployment, and other target mutation belong to separately authorised executors. OpsTruth then independently verifies the resulting state.

The permanent architecture and 0.4.0 direction are defined in:

- `docs/architecture/BOUNDARIES.md`: authority constitution and non-mutation invariant;
- `docs/architecture/EVIDENCE-GRAPH.md`: subject-bound evidence, portable snapshots, deltas, and contradictions;
- `docs/architecture/EXECUTION-PLANE.md`: protocol boundary for future authorised executors;
- `docs/roadmap/0.4.0.md`: Evidence Graph release plan and mandatory gates;
- `docs/maintainers/BOT.md`: staged, repository-scoped maintainer automation;
- `contracts/`: candidate v1 ActionRequest, ActionAuthorization, ExecutionReceipt, and VerificationResult schemas.

An ActionRequest grants no authority. An ExecutionReceipt is a signed claim, not proof that the requested outcome occurred. Post-execution success requires fresh, independent, subject-bound verification.

## Tool surface

- `opstruth_inspect_repository`
- `opstruth_audit_repository`
- `opstruth_trace_routes`
- `opstruth_audit_environment`
- `opstruth_audit_secrets`
- `opstruth_review_api_contracts`
- `opstruth_review_migrations`
- `opstruth_check_github_handoff`
- `opstruth_check_deployment`
- `opstruth_probe_deployment`
- `opstruth_prepare_sandbox_verification`
- `opstruth_discover_capabilities`
- `opstruth_plan_workflow`
- `opstruth_verify_receipt`
- `opstruth_verify_evidence_receipt`
- `opstruth_render_evidence`

## Local verification

```bash
npm run check
```

`npm run check` includes source safety, architecture-boundary enforcement, tests, contract examples, plugin validation, and eval validation.

## Production

The intended production endpoint is `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`.

The current evidence-signing identity is exposed at `https://opstruth-chatgpt.woeinvests.workers.dev/signing-key`. The deployment workflow provisions the Ed25519 private key as a Cloudflare Worker secret and never commits it.
