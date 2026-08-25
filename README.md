# OpsTruth for ChatGPT and Codex

OpsTruth is an evidence-first repository verification plugin. It combines focused workflow skills, a read-only MCP server, deterministic GitHub repository inspection, capability routing, AgentProof receipt verification and an optional evidence report UI.

The public release accepts only public GitHub repository URLs. It does not clone repositories, execute project code, install packages, read private repositories, deploy projects or mutate external state.

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
- `opstruth_discover_capabilities`
- `opstruth_plan_workflow`
- `opstruth_verify_receipt`
- `opstruth_render_evidence`

## Local verification

```bash
npm run check
```

## Production

The intended production endpoint is `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`.
