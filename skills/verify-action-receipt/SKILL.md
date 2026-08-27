---
name: verify-action-receipt
description: Use this when a user supplies an AgentProof v2, OpsTruth evidence receipt, or complete OpsTruth v1 execution handoff and needs integrity, signer trust or fresh outcome verification. Never execute, repeat or trust the underlying action merely because its receipt is cryptographically valid.
---

# Verify Action Receipt

Require the receipt document or complete OpsTruth report. Accept trusted signer fingerprints only when the user supplies them or they come from an authoritative policy source.

1. Call `opstruth_verify_receipt` for an AgentProof signed receipt v2.
2. Call `opstruth_verify_evidence_receipt` for a complete OpsTruth report containing its evidence receipt.
3. Distinguish structural validity, digest validity, cryptographic validity and signer trust.
4. Call `opstruth_verify_execution_result` only when the complete ActionRequest, ActionAuthorization and ExecutionReceipt are present together with separate authoritative authorizer and executor fingerprint allowlists and a public repository target.
5. Treat a valid signature from an untrusted signer as cryptographically valid but untrusted.
6. Treat global authorization nonce reuse as unproven unless an authoritative replay source is available outside the stateless public plugin.
7. Do not claim that the underlying action, inspection or deployment is correct merely because the receipt signature is valid.
8. Never execute, compensate, repeat or replay the recorded action.
