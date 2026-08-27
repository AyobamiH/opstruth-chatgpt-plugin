# Future Product Direction

This document records direction beyond 0.4.0 without granting authority or committing to dates.

## Executioner

Executioner is a separate execution-plane product that may perform explicitly authorised repository, CI, infrastructure, or deployment changes. It consumes OpsTruth protocol artifacts and emits signed receipts for independent verification.

Executioner must remain a separate repository, service identity, signing identity, security review, release process, and incident boundary.

It should begin only after the entry criteria in `docs/architecture/EXECUTION-PLANE.md` are met.

## Possible execution adapters

- isolated CI runner;
- OpenClaw Operator;
- Codex or another coding agent with explicit repository authority;
- provider-specific deployment controller;
- future native OpsTruth Executioner.

Compatibility is defined by contracts, not by sharing code or credentials with OpsTruth.

## Managed evidence storage

Managed graph history may become valuable, especially for scheduled verification and organization-wide state comparison. It is deferred until a separate design establishes:

- data classification and tenant isolation;
- encryption and key ownership;
- retention, export, deletion, and legal hold behavior;
- access logs and incident response;
- private repository metadata policy;
- user-visible controls and pricing impact.

Portable caller-held signed snapshots remain the default until that review is complete.

## Maintainer bot progression

| Version | Maximum authority |
| --- | --- |
| v0 | Read repository, inspect pull requests, run checks, publish workflow summary |
| v1 | Comment and label under a separately reviewed GitHub token policy |
| v2 | Create `bot/*` branches and maintenance pull requests |
| v3 | Update allowlisted generated files and dependency pins |
| v4 | Auto-merge narrowly allowlisted mechanical changes after independent checks |

No version may autonomously change architecture boundaries, agent instructions, security policy, contracts, workflows, signing, credentials, branch protection, release authority, or execution-plane authority.

The bot never approves its own pull request.

## Explicitly rejected direction

OpsTruth will not become a single component that finds a problem, mutates the target, and then independently certifies its own work. Convenience does not override evidence independence.
