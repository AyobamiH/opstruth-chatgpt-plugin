# OpsTruth for ChatGPT and Codex

OpsTruth is an evidence-first repository verification plugin. Version 0.4.0 adds Evidence Graph v1: deterministic subject binding across repositories, commits, CI, runtime observations and execution receipts, plus portable signed snapshots, offline verification, state deltas, contradiction preservation and a fail-closed DoneState v2 attestation bridge.

The public release accepts public GitHub repository URLs and explicitly supplied public HTTPS deployment URLs. It does not clone repositories, execute project code, install packages, read private repositories, deploy projects or mutate target systems. Fresh execution is represented by an approval-gated handoff contract for a separately connected isolated runner.

Usage analytics are privacy-safe and aggregate-only. The Worker records bounded tool, outcome, verdict, count, source-presence, signing, latency, version and coarse client-family fields. Optional feedback records only a controlled reason code and surface. It never records prompts, repository names, URLs, IPs, graph contents, receipts, free text or user identifiers. See `docs/release-readiness.md` for owner-only queries and the limitations of estimating ChatGPT usage.

## Architecture

- `skills/` teaches ChatGPT and Codex when and how to use the tools.
- `src/` implements the stateless Cloudflare Worker and MCP endpoint.
- `provenance/sources.json` pins the repositories and commits that informed each capability.
- `worker-ui/` documents the embedded evidence view.
- `test/` verifies protocol, safety and audit behavior.

OpsTruth deliberately separates observation from mutation. Private systems may later be inspected through brokered least-privilege read access. Repository writes, remediation, deployment, and other target mutation belong to separately authorised executors. OpsTruth then independently verifies the resulting state.

The DoneState exact-commit bridge has a separate verifier-owned GitHub App read lane for the single reviewed public repository. It uses short-lived installation credentials internally; callers cannot select its scope or submit credentials. General public-repository audit tools remain anonymous. See [GitHub App verification read lane](docs/github-app-verification.md).

The permanent architecture and 0.4.0 direction are defined in:

- `docs/architecture/BOUNDARIES.md`: authority constitution and non-mutation invariant;
- `docs/architecture/EVIDENCE-GRAPH.md`: subject-bound evidence, portable snapshots, deltas, and contradictions;
- `docs/architecture/EXECUTION-PLANE.md`: protocol boundary for future authorised executors;
- `docs/roadmap/0.4.0.md`: Evidence Graph release plan and mandatory gates;
- `docs/maintainers/BOT.md`: staged, repository-scoped maintainer automation;
- `contracts/`: candidate v1 ActionRequest, ActionAuthorization, ExecutionReceipt, and VerificationResult schemas.

An ActionRequest grants no authority. An ExecutionReceipt is a signed claim, not proof that the requested outcome occurred. Post-execution success requires fresh, independent, subject-bound verification.

Evidence Graph snapshots are stateless and caller-held. Their signatures prove integrity and signer key possession, while signer trust, freshness, authorisation and outcome correctness remain separate decisions.

## Tool surface

- `opstruth_get_verifier_identity`
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
- `opstruth_snapshot_evidence`
- `opstruth_compare_snapshots`
- `opstruth_verify_execution_result`
- `opstruth_attest_donestate_handoff`
- `opstruth_render_evidence`

## Local verification

```bash
npm run check
```

`npm run check` includes source safety, architecture-boundary enforcement, tests, contract examples, plugin validation, and eval validation.

## Production

The canonical production endpoint is `https://mcp.opstruth.io/mcp`. The `workers.dev` hostname remains enabled as a temporary compatibility surface.

The current evidence-signing identity is exposed at `https://mcp.opstruth.io/signing-key`. The deployment workflow provisions the Ed25519 private key as a Cloudflare Worker secret and never commits it.

GitHub App credentials are owner-provisioned Cloudflare Worker secrets. The deployment workflow verifies only their presence, and production health discloses only the authentication mode, configuration boolean and selected-public-repository scope.

Deployment receipts for the owned MCP domain are indexed in [Owned-domain cutover evidence](docs/OWNED-DOMAIN-CUTOVER.md).
