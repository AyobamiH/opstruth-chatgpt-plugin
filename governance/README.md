# Proposed main governance

Status: `BLOCKED`

This directory is a review-only proposal for OpsTruth `main`. It does not change GitHub repository settings. On 2026-09-01, the authenticated GitHub branch settings page reported `main` as `UNPROTECTED`. No active ruleset exists in this repository evidence.

Activation is blocked until the owner names one trusted human reviewer other than the owner and grants only the access needed for that person to approve pull requests. The reviewer field remains `null` because no person has been named. Do not replace it with a guessed identity.

## Ownership and merge authority

`@AyobamiH` is the current and only truthful code owner. The proposed `update` rule and sole user bypass actor keep merge authority with the repository owner. The bypass mode is `pull_request`, so it provides an owner-only emergency path with a pull-request audit trail. It does not permit direct pushes, force pushes, or branch deletion.

Normal changes require one approval from someone other than the last pusher, resolved review threads, and both required hosted checks. An emergency bypass is for restoration or incident containment only. The owner should identify the incident in the pull request, state which rule is bypassed, and open a follow-up review item. The proposal does not weaken the deletion or non-fast-forward rules for emergencies.

Code-owner review is not proposed as a required rule while the owner is the only truthful entry. Requiring it now would deadlock owner-authored pull requests because an author cannot approve their own change. The independent human approval rule becomes usable only after the activation blocker is resolved.

## Exact hosted check inventory

| Required context | Workflow | Job | Pull request trigger | Path filter | Job condition | Hosted sample |
| --- | --- | --- | --- | --- | --- | --- |
| `verify` | `CI` | `verify` | yes | none | none | PR #23, run `33484341570`, job `99780846732`, success |
| `review` | `OpsTruth maintainer review` | `review` | yes | none | none | PR #23, run `33484341539`, job `99780847006`, success |

The candidate removes the draft-only job condition from `review`, so GitHub creates that job for every configured pull-request activity. Neither required workflow uses `paths` or `paths-ignore` filters. The Cloudflare `deploy` job is not required because it runs after selected pushes to `main` or by manual dispatch and uses path filters.

GitHub commit skip directives can suppress an entire `push` or `pull_request` workflow. They must not be used on pull requests targeting `main`. If a contributor uses one, the safe recovery is a new reviewable commit without a skip directive; required checks must never be marked successful manually.

## Activation procedure

The owner must complete these steps before changing the proposed ruleset from `disabled` to `active`:

1. Name and verify a second trusted human reviewer.
2. Grant that reviewer only the repository access required for pull-request approval.
3. Reverify that GitHub user ID `47716486` resolves to owner `@AyobamiH` before applying the bypass actor payload.
4. Replace the `null` reviewer in `main-ruleset.proposed.json`, set the blocker to satisfied, and review the updated proposal in a pull request.
5. Confirm fresh pull-request runs emit exact contexts `verify` and `review` on the same head commit.
6. Apply the reviewed GitHub ruleset payload through an owner-controlled repository setting change.
7. Re-read provider settings and record separate evidence that enforcement is active.

Until all seven steps complete, the only supported state is `BLOCKED` and `UNPROTECTED`.

## Release and channel separation

This proposal does not deploy, publish, release, merge, or change channel state. It records the observed product identity as OpsTruth `0.4.0`, source `186ac58c7f76da942bb1b6bfc8c9b18bd2b812d5`, with the ChatGPT directory state `PUBLISHED`. Governance review evidence is not deployment or publication evidence.
