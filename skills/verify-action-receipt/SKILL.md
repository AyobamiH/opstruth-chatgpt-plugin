---
name: verify-action-receipt
description: Verify the structure, digest, signature and optional signer trust of an AgentProof signed receipt v2 without executing or repeating the recorded action. Use when the user supplies an AgentProof receipt or asks whether a claimed repository action has a cryptographically valid receipt.
---

# Verify Action Receipt

Require the receipt document. Accept trusted signer fingerprints only when the user supplies them or they come from an authoritative policy source.

1. Call `opstruth_verify_receipt` with the receipt and any explicitly trusted fingerprints.
2. Distinguish structural validity, digest validity, cryptographic validity and signer trust.
3. Treat a valid signature from an untrusted signer as cryptographically valid but untrusted.
4. Do not claim that the underlying action was correct merely because the receipt signature is valid.
5. Never execute, compensate or replay the recorded action.
