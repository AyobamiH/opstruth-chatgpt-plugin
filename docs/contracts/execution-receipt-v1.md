# ExecutionReceipt v1

Schema: `contracts/execution-receipt.schema.json`
Status: candidate

## Purpose

ExecutionReceipt is the executor's signed account of attempted operations, affected resources, artifacts, and terminal state.

## Required semantics

- The receipt binds the exact request and authorization digests.
- `idempotencyKey` matches the ActionRequest.
- `consumedAuthorizationNonce` matches the authorization.
- Operations are ordered and individually report a terminal state.
- Affected resources use provider identities or immutable digests.
- Claims reference requested assertion IDs.
- `changedState` reports whether the executor claims any mutation occurred.
- Failures and partial outcomes are retained.
- `digest` and `proof` bind all claims except the proof itself.

## Interpretation

`SUCCEEDED` is an executor claim, not an OpsTruth verification verdict. A cryptographically valid receipt can still be unauthorized, untrusted, unsafe, stale, incomplete, or contradicted by actual state.

Receipts must not embed credentials, secret values, unrestricted logs, or provider session data. They may reference separately governed evidence by digest.
