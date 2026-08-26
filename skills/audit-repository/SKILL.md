---
name: audit-repository
description: Use this when a user needs live, read-only evidence about a public GitHub repository, from a quick map to a broad readiness audit, environment review, secret-risk scan, API review or migration review. Do not use it for private repositories, credentials, code execution or write actions.
---

# Audit Repository

Require a public GitHub repository URL or `owner/name`. Never ask for a token or secret.

1. Call `opstruth_inspect_repository` when the user needs orientation or a bounded map.
2. Call `opstruth_audit_repository` when the user requests a broad audit.
3. Use the narrower audit tools only when the request targets one concern.
4. Call `opstruth_check_github_handoff` when the answer depends on current public workflow, check-run, commit-status or branch-protection evidence.
5. Distinguish verified observations from warnings, skipped checks and facts that remain unverified.
6. State that public CI evidence proves only the reported commit and run, not a fresh local execution by OpsTruth.
7. Use `opstruth_prepare_sandbox_verification` when build or test execution is required. Treat its output as an approval-gated handoff, never as execution evidence.
8. Do not deploy, commit, merge, install packages or claim that the public plugin executed repository code.
9. Offer `opstruth_render_evidence` after the evidence is complete when a visual summary would help.

Treat signed receipts as integrity and signer evidence, not proof that the repository is correct. Use `opstruth_verify_evidence_receipt` when independent receipt verification is requested.
