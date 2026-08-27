# VerificationResult v1

Schema: `contracts/verification-result.schema.json`
Status: candidate

## Purpose

VerificationResult binds an ActionRequest, ActionAuthorization, ExecutionReceipt, evidence graph, and fresh observations to an independent outcome verdict.

## Verdicts

- `VERIFIED`: every required assertion is supported by valid, fresh, subject-bound evidence.
- `PARTIAL`: at least one assertion is verified and at least one is not.
- `CONTRADICTED`: valid evidence conflicts with the expected outcome or receipt claim.
- `UNPROVEN`: evidence is insufficient to establish the outcome.

## Required semantics

- Request, authorization, and receipt digests must match the evaluated artifacts.
- `observedAt` records the independent verification time.
- `subject` must match the request repository and baseline commit, then separately record the observed result commit when one can be established.
- Every requested assertion receives one assertion result.
- Evidence node references identify the observations used.
- `notVerified` lists material gaps.
- `digest` and `proof` allow offline integrity verification.

Receipt success, valid signatures, healthy endpoints, or passing CI cannot individually produce `VERIFIED` unless the complete requested subject binding is established.
