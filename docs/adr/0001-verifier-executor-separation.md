# ADR 0001: Separate Verification from Execution

Status: accepted
Date: 2026-08-27

## Context

Users may want a closed loop from finding to remediation. Giving the verifier target write authority would let one component find, change, and certify the same state, weakening evidence independence and increasing credential exposure.

## Decision

OpsTruth remains a read-only evidence plane for inspected systems. Target mutation belongs to a separate execution plane that consumes a bounded request, requires independent authorization, and emits a signed receipt. OpsTruth then freshly re-observes the result.

## Consequences

- OpsTruth cannot offer direct remediation or deployment tools.
- Execution can be implemented by multiple compatible adapters.
- Protocol artifacts and subject binding become first-class product surfaces.
- Closed-loop workflows require more than one authority identity.

## Rejected alternatives

- An authenticated write mode inside OpsTruth.
- A feature flag that enables target mutation.
- Treating executor receipts as self-verifying outcomes.
