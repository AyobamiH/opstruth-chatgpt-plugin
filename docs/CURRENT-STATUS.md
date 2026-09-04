# Current status

As of 2026-09-04, OpsTruth `0.4.0` remains publicly visible in the OpenAI Plugins Directory on its owned MCP domain. The directory-release baseline remains commit `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`; the independent DoneState verifier runtime has since advanced through the reviewed P0 stack to current `main` `eef00ca4f242cf99d6b39e8c37ae4b84970a86e4`, which is production evidence for the DoneState bridge but does not rewrite the older directory-release record.

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

The directory-release deployment workflow and public health read-back bind version `0.4.0`, 21 tools, Evidence Graph `1.0.0`, configured signing, and commit `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`. The later DoneState-verifier production repair is separately bound below to exact source, CI, deployment, exact pull-request head and terminal DoneState outcome.

## Public channels

- OpenAI Plugins Directory: public listing `OpsTruth`, version `0.4.0`, developer `AYOBAMI JOHN HAASTRUP`, direct listing `https://chatgpt.com/plugins/plugins_6a8d4dc60bf081918a06094873890eb4`.
- OpenAI listing caveat: the visible metadata still links to the `workers.dev` compatibility origin. A clean-account install and real tool outcome remain unproven.
- GitHub Marketplace: the separate `AyobamiH/opstruth` repository publishes the `OpsTruth evidence` Action at `v1.0.0`; `v1` and `v1.0.0` resolve to `45f4debbd3fbe8217599ab697b8f6c855b372e0b`.
- Website channel: `opstruth.io` currently presents CLI version `0.2.0`, while the MCP and OpenAI channels present `0.4.0`. Channel-specific versions must be labelled and the website drift remains open.

The Marketplace Action is not a release of this plugin repository. This repository currently has no GitHub tag, GitHub release, or GitHub deployment record.

## P0 verifier repair outcome

The false-evidence repair stack is no longer merely a candidate. It reached `main`, deployed, and participated in a real production DoneState verification. The final repository-subject identity correction merged in PR #26 as `eef00ca4f242cf99d6b39e8c37ae4b84970a86e4`; exact-main CI `33808853938` passed and production deployment `33808853917` succeeded.

The deployed verifier uses short-lived installation credentials, authenticated exact-head Metadata/Contents/Checks/Commit-status reads, strict repository identity and scope checks, no anonymous or static-token success fallback, and the complete `donestate.verification-contract.v2` response envelope with pinned shared vectors.

## DoneState bridge state

Historical DoneState run `631d8a08-d337-4bae-bd18-b55c31f48a8b` remains valid historical `VERIFIED` evidence. Historical run `b4242932-0bc1-4876-a202-634d9c12d72a` remains unproven and must not be rewritten or retroactively trusted. Later predecessor runs #105, #108, #110 and #112 likewise retain their recorded terminal ambiguity or capability-block outcomes.

The fresh successor issue #114 produced exactly one durable run `c4a07fa6-90b2-4597-a4c6-eae66de5a3e8`, branch `donestate/c4a07fa6-90b2-4597-a4c6-eae66de5a3e8`, and open/unmerged DoneState PR #115 at exact head `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869`. Exact-head DoneState CI run `33806832575` passed `core (22)`, `core (24)`, and `hosted-plugin`.

The first OpsTruth response for that canary exposed a strict-schema defect: `report.subject.providerRepositoryId` was serialized as a string. DoneState rejected it rather than accepting partial or malformed evidence. PR #26 changed only that exact-commit evidence adapter to preserve GitHub's numeric repository identity and added a regression assertion. After `eef00ca4f242cf99d6b39e8c37ae4b84970a86e4` deployed, production OpsTruth returned the complete `{ contractVersion, report, attestation }` bundle for exact head `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869`; the report decision was `verified`, and DoneState accepted it into terminal `VERIFIED`.

This is the current live interoperability milestone. PR #115 remains open and unmerged evidence. No historical run is rewritten by the successful successor.

## Contract anti-drift controls

`contracts/donestate/manifest.json` pins the shared DoneState response/report/attestation schemas and verified/failed/uncertain/negative vectors by Git blob identity. `npm run validate:donestate-contract-lock` recomputes every vendored blob identity during normal CI. The read-only `DoneState contract drift` workflow runs hourly and compares those locked identities with the corresponding artifacts on `AyobamiH/donestate@main`, plus the v2 contract version, response-schema path and historical-outcome invariant. It has `contents: read` only and does not create, retry, mutate, merge or verify DoneState runs.

## Maintainer and main-branch governance

Maintainer bot v0 remains a deterministic, contents-read evidence source. It cannot approve, merge, deploy, release, or sign verification for its own change.

`main` is currently unprotected. GitHub reports required status-check enforcement off and zero active repository rulesets, so provider activation remains **BLOCKED_PROVIDER_ACTION**. The repository now carries an activation-ready mechanical proposal that requires pull requests, the always-emitted `verify` and `review` GitHub Actions checks, strict target-branch freshness, resolved review conversations, deletion blocking, and non-fast-forward blocking with zero required human approvals. A second trusted human reviewer is a follow-on strengthening step that adds one independent approval later and may not weaken the mechanical baseline.

`npm run validate:main-governance` fails if the checked-in proposal invents active provider state, silently adds a human approval before a reviewer exists, drops either required check, widens the target beyond `main`, or weakens deletion/non-fast-forward protection. CODEOWNERS still names only `@AyobamiH`, and the owner remains the only merge authority. Provider settings must be applied and independently read back before this document may claim protection is active.

Security, authentication, deployment, release, and evidence-contract changes remain authority-sensitive. A commit-bound tag and release must wait until the repaired deployed identity is reconciled to exact channel identities.

## Deferred scope

Private-repository evidence brokerage, managed longitudinal storage, a verifier fleet, and higher maintainer write stages remain deferred. OpsTruth does not execute repair, merge, deployment, or release actions against inspected systems.

## 2026-09-03 DoneState v2 repository-subject identity repair

- Production DoneState canary #114 reached OpsTruth v2 after its exact-head CI passed, and the deployed verifier returned HTTP 200.
- DoneState correctly rejected the response because `report.subject.providerRepositoryId` was a string even though the shared verification-report schema requires an integer or null.
- Root cause was isolated to the exact-commit GitHub verification evidence adapter: GitHub supplies a numeric repository ID, but OpsTruth converted it with `String(metadata.id)` before building the signed report.
- The repair converts only the exact-commit verification evidence repository ID to `Number(metadata.id)` and adds a regression assertion that the value remains numeric. General repository-audit snapshot semantics are unchanged.
- The repaired source passed CI, deployed, returned a strict complete v2 response for PR #115 head `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869`, and DoneState reached terminal `VERIFIED`; the earlier malformed response remains part of the failure history rather than being reclassified.
