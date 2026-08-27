# Maintainer Automation

`opstruth-maintainer` v0 is deterministic repository automation. It runs the complete verification suite, classifies changed paths, identifies protected and authority-sensitive changes, and writes an evidence summary to the GitHub Actions run.

Version 0 deliberately has contents read permission only. It does not use a model, comment, label, create branches, approve, merge, release, or deploy.

The normative authority policy is `docs/maintainers/BOT.md`. `policy.json` is the machine-readable path policy used by `scripts/maintainer-review.mjs`.

Branch protection and required-review configuration live in GitHub settings and cannot be proved by repository files alone. The bot reports them as unproven until independently inspected.
