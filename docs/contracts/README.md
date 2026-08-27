# OpsTruth Protocol Contracts

Status: v1 protocol implemented for OpsTruth 0.4.0

The execution handoff consists of four artifacts:

1. ActionRequest proposes a bounded outcome and grants no authority.
2. ActionAuthorization records an explicit, signed decision for one request digest.
3. ExecutionReceipt records signed executor claims about attempted operations.
4. VerificationResult records OpsTruth's independent comparison with fresh state.

The machine-readable schemas are in `contracts/`. These contracts do not add an executor to this repository.

## Canonicalization

Before v1 implementation, each artifact must use JSON Canonicalization Scheme, RFC 8785. The canonical payload excludes top-level `digest` and `proof` fields.

The digest is lowercase SHA-256 with a `sha256:` prefix over:

```text
domain-separator || canonical-payload
```

Domain separators:

| Artifact | Domain separator |
| --- | --- |
| ActionRequest | `opstruth.action-request.v1\0` |
| ActionAuthorization | `opstruth.action-authorization.v1\0` |
| ExecutionReceipt | `opstruth.execution-receipt.v1\0` |
| VerificationResult | `opstruth.verification-result.v1\0` |

Signatures use Ed25519 over the same domain-separated canonical bytes. A valid signature proves integrity and signer key possession. Trust remains an explicit caller or policy decision.

The files under `contracts/examples/` are structural schema fixtures. Their repeated digests, keys, and signatures are deliberately non-cryptographic placeholders and must never be used as protocol test vectors. Reproducible cryptographic vectors live in `contracts/vectors/protocol-v1.json` and are checked by both the runtime implementation and an independent standalone verifier.

## Compatibility

- Adding an optional field is a minor schema change.
- Adding a required field, changing canonicalization, changing a field's meaning, or removing an enum value requires a major schema version.
- Unknown major versions fail closed.
- Unknown optional fields are rejected by v1 schemas so signed semantics cannot change silently.
- Enum values are never redefined.
- Time values use RFC 3339 UTC timestamps.
- Digests always identify their algorithm.

## Security properties

- The request digest binds every later artifact.
- Authorization expires and contains a single-use nonce.
- The idempotency key is bound to the request and subject.
- Receipt state includes partial, rejected, cancelled, and unknown outcomes.
- Verification never converts executor success directly into `VERIFIED`.
- Artifacts contain references and digests, not credentials or secret values.
