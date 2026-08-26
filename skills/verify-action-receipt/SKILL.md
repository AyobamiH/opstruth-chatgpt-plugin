---
name: verify-action-receipt
description: Use this when a user supplies an AgentProof v2 or OpsTruth evidence receipt and needs its structure, digest, signature or signer trust checked. Never execute, repeat or trust the underlying action merely because its receipt is cryptographically valid.
---

# Verify Action Receipt

Require the receipt document or complete OpsTruth report. Accept trusted signer fingerprints only when the user supplies them or they come from an authoritative policy source.

1. Call `opstruth_verify_receipt` for an AgentProof signed receipt v2.
2. Call `opstruth_verify_evidence_receipt` for a complete OpsTruth report containing its evidence receipt.
3. Distinguish structural validity, digest validity, cryptographic validity and signer trust.
4. Treat a valid signature from an untrusted signer as cryptographically valid but untrusted.
5. Do not claim that the underlying action, inspection or deployment is correct merely because the receipt signature is valid.
6. Never execute, compensate, repeat or replay the recorded action.
