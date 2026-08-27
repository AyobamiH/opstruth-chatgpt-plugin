# ADR 0003: Independently Verify Execution Outcomes

Status: accepted
Date: 2026-08-27

## Context

A signed execution receipt establishes integrity of a claim. It does not prove authority, safety, correctness, or current deployed state.

## Decision

OpsTruth issues a post-execution verdict only after binding the request, authorization, receipt, and fresh observations to the same exact subject. The allowed verdicts are `VERIFIED`, `PARTIAL`, `CONTRADICTED`, and `UNPROVEN`.

## Consequences

- Receipt success cannot directly map to `VERIFIED`.
- Missing deployment identity remains `UNPROVEN` even if health probes pass.
- Conflicting evidence is preserved and reported.
- Verifier and executor identities and keys remain separate.

## Rejected alternatives

- Trusting a receipt solely because its signature is valid.
- Letting the executor produce the final verification verdict.
- Treating a successful HTTP probe as deployment provenance.
