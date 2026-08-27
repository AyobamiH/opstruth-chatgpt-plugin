# ActionRequest v1

Schema: `contracts/action-request.schema.json`
Status: candidate

## Purpose

An ActionRequest translates a finding into a bounded, reviewable proposal. It does not authorize execution.

## Required semantics

- `requestId` is globally unique.
- `createdAt` and `expiresAt` bound the proposal lifetime.
- `subject` binds the provider repository ID and exact baseline commit before execution. An optional environment narrows deployment work.
- `findingRefs` bind the request to evidence graph findings or report digests.
- `requestedOutcome.assertions` are independently verifiable postconditions.
- Each assertion has a controlled `target` node type, field, and bounded match selector. Descriptive prose never drives the deterministic verifier.
- `permittedOperations` is an allowlist. Absence from this list means not permitted.
- `forbiddenOperations` records explicit denials that cannot be weakened by authorization.
- `constraints` bounds paths, duration, operation count, network behavior, and environments.
- `approvalRequirement.required` is always `true` in v1.
- `approvalRequirement.minimumApprovals` is exactly one in v1. Multi-party authorization requires a later contract revision rather than an ambiguous array convention.
- `idempotencyKey` is unique to the subject and intended outcome.
- `digest` follows `docs/contracts/README.md`.

## Invalid requests

A production executor rejects a request when:

- the subject cannot be resolved exactly;
- the baseline commit is not a full immutable SHA;
- the outcome has no machine-verifiable assertion;
- scope uses ambiguous language instead of explicit operations and resources;
- requested and forbidden operations conflict;
- the request is expired;
- the digest or schema is invalid;
- authorization is embedded in or inferred from the request.

## Authority rule

Creating or signing an ActionRequest grants no permission to perform any operation. Execution requires a separate ActionAuthorization bound to the request digest.
