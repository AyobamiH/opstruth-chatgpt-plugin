# ADR 0004: Scope Maintainer Bot Authority to OpsTruth

Status: accepted
Date: 2026-08-27

## Context

The OpsTruth repository needs continuous checks for architecture drift, contract changes, release impact, and documentation mismatch. Repository maintenance is different from the public verifier's authority against inspected systems.

## Decision

Create `opstruth-maintainer` as a staged, repository-scoped maintenance plane. Version 0 has contents read permission and publishes deterministic workflow evidence. Later write capabilities require separate review and never include protected governance or authority files.

## Consequences

- The bot can help maintain OpsTruth without making public OpsTruth writable.
- CODEOWNERS and branch protection remain human enforcement points.
- The bot cannot approve or merge its own work.
- Any future token expansion is an authority-sensitive architecture change.

## Rejected alternatives

- Giving v0 broad pull-request or contents write access.
- Letting the bot change its own policy or workflows.
- Treating maintainer authority as permission to modify inspected repositories.
