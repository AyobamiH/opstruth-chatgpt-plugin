# ActionAuthorization v1

Schema: `contracts/action-authorization.schema.json`
Status: candidate

## Purpose

ActionAuthorization records an explicit signed decision by a human or policy authority. It binds one request digest to a narrower or equal operation scope, expiry, and single-use nonce.

Version 1 represents exactly one approval. A future multi-party policy must define multiple independently verifiable authorizations or a separately reviewed aggregate proof format.

## Required semantics

- `requestDigest` must match the validated ActionRequest.
- `decision` is `APPROVED` or `DENIED`.
- `grantedOperations` cannot contain an operation absent from the request allowlist.
- `expiresAt` cannot exceed the ActionRequest expiry.
- `nonce` is consumed atomically before mutation.
- `approver` identifies the authority under a trust policy external to the artifact.
- `digest` and `proof` follow the canonicalization and signature rules.

## Fail-closed conditions

- Unknown or untrusted approver.
- Expired, revoked, replayed, or already consumed authorization.
- Request digest mismatch.
- Subject or operation-scope expansion.
- Invalid signature, canonicalization, or schema.
- `DENIED` decision.

Possession of an executor credential does not replace authorization.
