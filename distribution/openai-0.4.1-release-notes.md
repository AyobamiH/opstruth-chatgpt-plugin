# OpsTruth 0.4.1

This update preserves the existing 21-tool read-only OpsTruth surface while upgrading the implementation behind independent repository verification.

- Uses the canonical `https://mcp.opstruth.io/mcp` service identity.
- Verifies selected DoneState exact heads through short-lived GitHub App installation credentials rather than anonymous or static-token success fallbacks.
- Returns the complete `donestate.verification-contract.v2` response bundle with report and signed attestation, and fails closed on malformed, incomplete, stale or contradictory evidence.
- Preserves numeric GitHub repository identity in signed verification reports.
- Keeps all public OpsTruth tools read-only toward inspected repositories, CI systems and deployments.
- Adds continuous read-only contract drift detection against the public DoneState contract without granting mutation authority.
- Proven against the production DoneState successor #114 / PR #115 path, where an initially malformed verifier response was rejected and the corrected complete v2 response produced terminal `VERIFIED` without rewriting historical outcomes.

No existing public tool is removed or renamed in this version.
