# OpsTruth plugin agent knowledge

## Architecture and entry paths

This is the independent Cloudflare Worker/MCP verifier, not the OpsTruth CLI repository. [Worker entry](../../src/worker.js) routes protocol calls to [tools](../../src/tools.js), with [GitHub reads](../../src/github.js), [Evidence Graph](../../src/evidence-graph.js), and [DoneState attestation](../../src/donestate.js). [Product skills](../../skills) describe tool use; the development security skill is separate.

## Setup and checks

[Package scripts](../../package.json) require Node >=20. Local checks use `npm run check`, which includes policy, syntax, boundaries, unit tests, contracts/vectors, plugin/evals and documentation closure. `npm run docs:check` is the focused documentation check. `npm run dev` invokes pinned Wrangler through npx and may download tooling. No deploy or production smoke command is an offline check.

## State and security boundaries

The [authority constitution](../../docs/architecture/BOUNDARIES.md) forbids target mutation. Keep [verifier/executor separation](../../docs/adr/0001-verifier-executor-separation.md), [private read-only access](../../docs/adr/0002-private-repositories-are-read-only.md), and [maintainer authority](../../docs/maintainers/BOT.md). A receipt is a claim, not outcome proof. Caller-held signed snapshots do not prove freshness or signer trust. Never accept or expose credentials in tools or reports.

## Decisions and authoritative references

Use [Evidence Graph architecture](../../docs/architecture/EVIDENCE-GRAPH.md), [contracts](../../docs/contracts/README.md), [post-execution decision](../../docs/adr/0003-independent-post-execution-verification.md), and [provenance](../../provenance/sources.json). [Release readiness](../../docs/release-readiness.md) describes gates; dated status documents are historical evidence until reverified. Approval, publishing and deployment remain separate outcomes.
