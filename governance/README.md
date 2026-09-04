# Proposed main governance

Status: `BLOCKED_PROVIDER_ACTION`

This directory contains the reviewed activation payload for OpsTruth `main`. It does not change GitHub repository settings by itself. On 2026-09-04, provider read-back still reported `main` as `UNPROTECTED`, required status-check enforcement off, and zero active rulesets.

The design is deliberately staged so a missing second trusted human reviewer does not leave `main` mechanically unprotected.

## Stage 1: mechanical baseline

The activation-ready baseline requires:

- every `main` update through a pull request;
- exact hosted checks `verify` and `review` on the current pull-request head;
- strict freshness against the target branch;
- resolved review conversations;
- deletion blocked;
- non-fast-forward updates blocked;
- zero required human approvals until a real independent reviewer exists.

`@AyobamiH` remains the current truthful code owner and only merge authority. One owner emergency bypass is retained in `always` mode so repository recovery does not require deleting or disabling the ruleset. It is emergency authority, not a normal direct-push path.

## Stage 2: independent human review

After a trusted human other than the owner is named and the qualifying provider access model is accepted, strengthen the active ruleset to require one independent approval. This stage may only add constraints. It must not remove the pull-request requirement, required checks, freshness, deletion blocking, or non-fast-forward blocking.

The reviewer field remains `null` until a real person is named. Automated OpsTruth, DoneState, GitHub Actions, bot, or agent output does not count as independent human approval.

## Exact hosted check inventory

| Required context | Workflow | Job | Pull request trigger | Path filter | Job condition |
| --- | --- | --- | --- | --- | --- |
| `verify` | `CI` | `verify` | yes | none | none |
| `review` | `OpsTruth maintainer review` | `review` | yes | none | none |

Both required contexts are emitted by GitHub Actions on configured pull-request activity. The Cloudflare `deploy` job is excluded because it is not an always-emitted pull-request check.

GitHub commit skip directives can suppress an entire workflow. They must not be used on pull requests targeting `main`. The safe recovery is a new reviewable commit without a skip directive; required checks must never be marked successful manually.

## Provider activation procedure

Repository implementation is ready. Provider activation remains `BLOCKED_PROVIDER_ACTION` until an authenticated owner settings write and independent read-back occur.

1. Reverify GitHub user ID `47716486` resolves to owner `@AyobamiH` before applying the emergency bypass actor.
2. Confirm a fresh pull request emits `verify` and `review` on the same current head.
3. Apply `githubRuleset` from `main-ruleset.proposed.json`, changing only `enforcement` from `disabled` to `active`.
4. Do not add another target, bypass actor, approval, or required check in that same provider action.
5. Re-read provider settings and record the ruleset ID, active enforcement, effective `main` rules, and timestamp.
6. Use a harmless test pull request to prove the normal PR/check path and destructive-ref blocking.
7. Only after that read-back may repository truth change from `UNPROTECTED` and `BLOCKED_PROVIDER_ACTION` to active protection.

The second trusted human reviewer is a follow-on strengthening gate, not a prerequisite to Stage 1.

## Release and channel separation

This proposal does not deploy, publish, release, merge, or change channel state. It preserves the observed directory identity OpsTruth `0.4.0`, source baseline `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`, and ChatGPT directory state `PUBLISHED`. Governance evidence is not deployment or publication evidence.
