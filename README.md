# OpsTruth for ChatGPT and Codex

OpsTruth is an evidence-first repository verification plugin. It combines focused workflow skills, a read-only MCP server, deterministic GitHub repository inspection, current public CI evidence, bounded HTTPS deployment probes, capability routing, signed evidence receipts, AgentProof verification and an optional evidence report UI.

The public release accepts public GitHub repository URLs and explicitly supplied public HTTPS deployment URLs. It does not clone repositories, execute project code, install packages, read private repositories, deploy projects or mutate target systems. Fresh execution is represented by an approval-gated handoff contract for a separately connected isolated runner.

## Architecture

- `skills/` teaches ChatGPT and Codex when and how to use the tools.
- `src/` implements the stateless Cloudflare Worker and MCP endpoint.
- `provenance/sources.json` pins the repositories and commits that informed each capability.
- `worker-ui/` documents the embedded evidence view.
- `test/` verifies protocol, safety and audit behavior.

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

## Production

The intended production endpoint is `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`.

The current evidence-signing identity is exposed at `https://opstruth-chatgpt.woeinvests.workers.dev/signing-key`. The deployment workflow provisions the Ed25519 private key as a Cloudflare Worker secret and never commits it.
