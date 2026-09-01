# Current status

As of 2026-09-01, OpsTruth `0.4.0` is publicly visible in the OpenAI Plugins Directory and deployed on its owned MCP domain. The deployed source is not production-ready because five false-evidence or deployed-probe defects remain open and the repository has no enforced protected review or commit-bound release identity.

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

- #12: semantic snapshot deltas instead of timestamp-driven churn
- #13: Cloudflare custom-domain self-probe 522 and deployed comparison smoke
- #14: capability-specific migration coverage that fails closed on omissions
- #15: exact-head GitHub outcome classification instead of endpoint-availability claims
- #16: scoped graph verdicts with release readiness explicitly unproven
- #17: protected human review and commit-bound release identity
- #18: adversarial, negative, and deployed regression gates

Live reproductions confirmed the migration false-complete result and the internal 522 self-probe on the deployed commit. A green historical suite and smoke are therefore evidence about those runs only, not proof the current production behavior is correct.

## DoneState bridge state

Historical DoneState run `631d8a08-d337-4bae-bd18-b55c31f48a8b` remains valid historical `VERIFIED` evidence. Fresh canary `b4242932-0bc1-4876-a202-634d9c12d72a` remains unproven. The latest retry failed closed on GitHub's anonymous rate limit and did not add an attestation. The active dependency is plugin issue #11 for a verifier-owned least-privilege authenticated GitHub read lane.

DoneState PR #22 was later owner-merged without public terminal verifier evidence. That owner action does not widen OpsTruth authority and does not verify the canary.

## Maintainer and release gates

Maintainer bot v0 remains a deterministic, contents-read evidence source. It cannot approve, merge, deploy, release, or sign verification for its own change.

`main` is currently unprotected, repository rulesets are absent, CODEOWNERS names only `@AyobamiH`, and no second trusted human reviewer is identified. Security, authentication, deployment, release, and evidence-contract changes require non-author human review before merge. A commit-bound tag and release must wait until the P0 repairs are merged, deployed, independently regressed, and reconciled to exact channel identities.

## Deferred scope

Private-repository evidence brokerage, managed longitudinal storage, a verifier fleet, and higher maintainer write stages remain deferred. OpsTruth does not execute repair, merge, deployment, or release actions against inspected systems.
