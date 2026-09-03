# Current status

As of 2026-09-01, OpsTruth `0.4.0` is publicly visible in the OpenAI Plugins Directory and deployed on its owned MCP domain. The currently deployed source remains commit `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`; the P0 repair stack on PR #20 is not production evidence until it reaches `main`, deploys, and passes fresh read-back.

## Verified production identity

- deployed Worker source commit: `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`
- exact-main CI: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33341464435` (`success`)
- exact-main deployment workflow: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33341464399` (`success`)
- deployment-log Worker version: `811fe35d-34a2-444f-a36f-a8421931ade2`
- canonical endpoint: `https://mcp.opstruth.io/mcp`
- compatibility endpoint: `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`
- public tool count: 21
- workflow skill count: 6
- authority mode: read-only public evidence
- signer fingerprint: `sha256:09544c3ede70b832a114918bb439960004655faf9d36981e1402587af9429c86`

The deployment workflow and public health read-back bind version `0.4.0`, 21 tools, Evidence Graph `1.0.0`, configured signing, and commit `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`. The Cloudflare provider control plane was not independently read during this reconciliation, so the active provider version remains an owner-side read-back gate.

## Public channels

- OpenAI Plugins Directory: public listing `OpsTruth`, version `0.4.0`, developer `AYOBAMI JOHN HAASTRUP`, direct listing `https://chatgpt.com/plugins/plugins_6a8d4dc60bf081918a06094873890eb4`.
- OpenAI listing caveat: the visible metadata still links to the `workers.dev` compatibility origin. A clean-account install and real tool outcome remain unproven.
- GitHub Marketplace: the separate `AyobamiH/opstruth` repository publishes the `OpsTruth evidence` Action at `v1.0.0`; `v1` and `v1.0.0` resolve to `45f4debbd3fbe8217599ab697b8f6c855b372e0b`.
- Website channel: `opstruth.io` currently presents CLI version `0.2.0`, while the MCP and OpenAI channels present `0.4.0`. Channel-specific versions must be labelled and the website drift remains open.

The Marketplace Action is not a release of this plugin repository. This repository currently has no GitHub tag, GitHub release, or GitHub deployment record.

## Active P0 repair program

The open carrier PR #20 now contains the reconciled false-evidence repairs plus the stacked verifier work that was reviewed separately in #23 and #25. Until #20 reaches `main`, those changes remain candidate source rather than deployed truth.

The carrier includes capability-specific migration completeness, exact-head GitHub outcome classification, scoped graph verdicts, the internal-versus-independent deployment smoke regression, a verifier-owned GitHub App read lane restricted to `AyobamiH/donestate`, and the complete `donestate.verification-contract.v2` response envelope with pinned shared vectors.

## DoneState bridge state

Historical DoneState run `631d8a08-d337-4bae-bd18-b55c31f48a8b` remains valid historical `VERIFIED` evidence. Historical run `b4242932-0bc1-4876-a202-634d9c12d72a` remains unproven and must not be rewritten or retroactively trusted.

The candidate verifier lane uses short-lived installation credentials, authenticated exact-head Metadata/Contents/Checks/Commit-status reads, strict repository identity and scope checks, and no anonymous or static-token success fallback. The candidate bridge returns the strict `{ contractVersion, report, attestation }` response required by DoneState. Neither capability is recorded as production-ready until the carrier is independently reviewed, merged to `main`, the GitHub App is correctly installed/configured, the exact main commit deploys, and a new consequence-disabled sealed canary reaches terminal read-back.

DoneState PR #22 was owner-merged without public terminal verifier evidence. That owner action does not widen OpsTruth authority and does not verify the historical canary.

## Maintainer and release gates

Maintainer bot v0 remains a deterministic, contents-read evidence source. It cannot approve, merge, deploy, release, or sign verification for its own change.

`main` is currently unprotected, repository rulesets are not enforced, CODEOWNERS names only `@AyobamiH`, and no second trusted human reviewer is identified. Security, authentication, deployment, release, and evidence-contract changes require non-author human review before merge. A commit-bound tag and release must wait until the repaired deployed identity is reconciled to exact channel identities.

## Deferred scope

Private-repository evidence brokerage, managed longitudinal storage, a verifier fleet, and higher maintainer write stages remain deferred. OpsTruth does not execute repair, merge, deployment, or release actions against inspected systems.

## 2026-09-03 DoneState v2 repository-subject identity repair

- Production DoneState canary #114 reached OpsTruth v2 after its exact-head CI passed, and the deployed verifier returned HTTP 200.
- DoneState correctly rejected the response because `report.subject.providerRepositoryId` was a string even though the shared verification-report schema requires an integer or null.
- Root cause is isolated to the exact-commit GitHub verification evidence adapter: GitHub supplies a numeric repository ID, but OpsTruth converted it with `String(metadata.id)` before building the signed report.
- This repair converts only the exact-commit verification evidence repository ID to `Number(metadata.id)` and adds a regression assertion that the value remains numeric. General repository-audit snapshot semantics are unchanged.
- Completion remains unproven until this source revision passes the full repository check, is deployed, and a fresh DoneState canary reaches the complete sealed-handoff -> OpsTruth v2 -> DoneState `VERIFIED` chain.
