# OpsTruth Maintainer Bot

Status: v0 policy
Bot identity: `opstruth-maintainer`
Jurisdiction: this repository only

## Purpose

The maintainer bot keeps the OpsTruth repository aligned with its authority constitution. It is maintenance-plane automation, not an OpsTruth public verification tool and not an executor.

## Version 0 authority

Version 0 may:

- read the checked-out pull-request revision and base revision;
- run `npm run check`;
- classify changed paths and release impact;
- identify protected and authority-sensitive files;
- write a summary to its own GitHub Actions run.

Version 0 must not:

- comment on, label, approve, close, or merge a pull request;
- push a branch, commit, tag, or release;
- deploy OpsTruth or any inspected system;
- access repository or deployment secrets;
- change its own workflow or policy;
- call a model or external service with repository contents;
- claim branch protection, CODEOWNERS enforcement, production state, or human review occurred when those facts were not observed.

The workflow declares `contents: read`. Any permission expansion is an authority-sensitive change that requires a human owner and a new policy version.

## Review output

Every review separates:

- `VERIFIED`: checks and repository facts observed in the run;
- `RISKY`: protected or authority-sensitive changes needing human attention;
- `UNPROVEN`: external enforcement, runtime, publication, or review facts not observed;
- `ARCHITECTURE`: whether deterministic boundary checks passed;
- `RELEASE IMPACT`: none, patch, minor, or major review level.

The report is evidence for a maintainer. It is not an approval.

## Protected changes

The bot never autonomously changes or approves changes to:

- `AGENTS.md`;
- `docs/architecture/BOUNDARIES.md`;
- architecture ADRs;
- `SECURITY.md`;
- `contracts/`;
- `.github/workflows/`;
- `.github/CODEOWNERS`;
- `.github/maintainer/policy.json`;
- signing-key generation or signing infrastructure;
- boundary, contract-validation, and maintainer-review control scripts or their tests;
- `package.json` check and release scripts;
- Cloudflare configuration or credentials;
- branch protection and release authority;
- public tool authority or execution-plane authority.

Protected changes can be legitimate. They require an identifiable human owner, explicit rationale, boundary checks, and compatibility or migration evidence where applicable.

## Staged progression

| Version | Additional maximum authority | Prerequisite |
| --- | --- | --- |
| v1 | Comment and label | Separate token and prompt-injection review, bounded templates, rate limits |
| v2 | Create `bot/*` branches and maintenance pull requests | Provenance, signing, no self-approval, recovery procedure |
| v3 | Update allowlisted generated files and dependency pins | File allowlist, reproducible generation, supply-chain review |
| v4 | Auto-merge allowlisted mechanical changes | Independent required checks and branch protection |

No version can autonomously modify protected files. No version can approve its own pull request.

## Ownership and escalation

CODEOWNERS identifies the human review owner. Repository settings must separately make the relevant checks and reviews required. A committed CODEOWNERS file is evidence of declared ownership, not proof that GitHub currently enforces it.

If the bot finds a possible authority expansion, it must fail closed or require human review. It must never reinterpret the constitution to make a requested change pass.

## Compromise response

If maintainer automation is suspected of compromise:

1. Disable its workflow.
2. Revoke any bot-specific token or application installation.
3. Preserve workflow logs and affected commit identities.
4. Inspect protected files and repository settings independently.
5. Rotate affected signing or deployment credentials under their own runbooks.
6. Re-enable only after a human-reviewed root-cause and containment record.

Version 0 holds no write token, which limits its direct recovery surface.
