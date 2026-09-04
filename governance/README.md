# Main governance

Status: `ACTIVE`

OpsTruth `main` is **PROTECTED** at the GitHub provider layer by active ruleset **22247265**, `OpsTruth main mechanical governance`, targeting only `refs/heads/main`.

## Active Stage 1 mechanical baseline

The provider-enforced baseline requires every normal `main` update through a pull request, exact `verify` and `review` checks pinned to GitHub Actions integration `15368`, strict target freshness, resolved review conversations, deletion blocking, non-fast-forward blocking, zero required human approvals, and one owner emergency bypass in `always` mode.

Enforcement was proven through governance-only PR #29. Exact head `6ec09aed203b8beb4b0358c064f29f5f1690a79b` ran CI `33838447356` and maintainer review `33838447326`; both required checks succeeded before normal merge `7cc308895cbbe06856cb4a3c80ff243a58eeb132`. Activation issue #28 closed completed.

The `githubRuleset` object in `main-ruleset.proposed.json` intentionally remains an import-safe `disabled` template. Provider truth is recorded by `providerObservation`, `activationReadBack`, and `provider-enforcement-readback.json`.

## Stage 2

After a trusted human other than the owner is named, strengthen the active ruleset with one independent approval. Stage 2 may only add constraints and must not weaken Stage 1. Automated OpsTruth, DoneState, GitHub Actions, bot, or agent output does not count as independent human approval.

## Exact hosted checks

`verify` comes from `CI`; `review` comes from `OpsTruth maintainer review`. Both are unfiltered pull-request jobs. The Cloudflare `deploy` job is excluded because it is not always emitted on pull requests.

## Drift response

Treat protection as regressed if ruleset 22247265 is disabled, deleted, retargeted, loses either required check, stops requiring target freshness or resolved conversations, or stops blocking deletion/non-fast-forward updates. Normal work must not use the owner emergency bypass.

Main protection does not itself publish, release, deploy, or alter OpenAI directory state.
