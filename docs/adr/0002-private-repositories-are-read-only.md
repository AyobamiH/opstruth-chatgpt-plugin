# ADR 0002: Private Repository Access Is Read-Only

Status: accepted
Date: 2026-08-27

## Context

Private repository visibility is necessary for many real-world verification workflows. Visibility and mutation authority are different security properties.

## Decision

OpsTruth may later inspect private repositories through a provider application or credential broker with mechanically verified, least-privilege read permissions. Raw credentials are never accepted as tool inputs or exposed to model-visible output.

## Consequences

- Private support does not require an OpsTruth write mode.
- Token brokering, revocation, tenant isolation, and audit controls are release prerequisites.
- Provider write permissions fail the evidence-plane policy.

## Rejected alternatives

- Personal access tokens pasted into prompts or MCP calls.
- Reusing an executor credential for verification.
- Broad provider scopes for implementation convenience.
