---
schema: clawsweeper.project-vision.v1
project_id: opstruth-chatgpt-plugin
repository: AyobamiH/opstruth-chatgpt-plugin
---

# Project Vision

## Identity

This repository is the independent public OpsTruth integration for ChatGPT and Codex.

## Purpose

Expose evidence-first repository and deployment verification through a safe hosted MCP surface while keeping inspection separate from target mutation.

## Owns

- Stateless hosted OpsTruth tools, contracts, schemas, evals, and plugin packaging.
- Evidence Graph snapshots, subject binding, deltas, contradiction preservation, and verifier identity.
- Narrow verifier-owned read access where explicitly designed.
- Privacy-safe aggregate operational analytics for this service.

## Does Not Own

- Remediation, repository writes, target deployment, or approval authority.
- A general execution plane for systems it verifies.
- Trust in an execution receipt merely because it is signed.
- The standalone OpsTruth CLI implementation.

## Non-Negotiable Invariants

- Target inspection remains non-mutating.
- Credentials and secret values are never accepted as tool inputs or exposed in reports.
- Executor and verifier identities, keys, authority, and audit records stay separate.
- Execution receipts are claims to verify, not proof of outcome.
- Private-repository access, when supported, is brokered and least-privilege.
- Publication/review status is distinct from deployment status.

## Evidence of Done

Verification claims require fresh, subject-bound evidence. A successful tool call, signature, deployment, or directory submission is not by itself proof of the target outcome or public publication.

## Relationships

- opstruth: standalone read-only CLI/product.
- DoneState: executor whose sealed results may be independently verified.
- Proof & State: portfolio governance.

## Canonical Sources

README.md, AGENTS.md, docs/architecture/BOUNDARIES.md, docs/architecture/EVIDENCE-GRAPH.md, docs/architecture/EXECUTION-PLANE.md, and current release-readiness evidence.

## Agent Rule

Keep this repository a verifier. Any capability requiring target mutation belongs in a separately authorised execution plane.
