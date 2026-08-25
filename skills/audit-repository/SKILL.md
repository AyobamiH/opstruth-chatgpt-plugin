---
name: audit-repository
description: Audit a public GitHub repository with live read-only OpsTruth evidence. Use when the user wants a repository map, broad readiness audit, environment review, secret-risk scan, API or migration review, or an evidence-backed understanding before changing code.
---

# Audit Repository

Require a public GitHub repository URL or `owner/name`. Never ask for a token or secret.

1. Call `opstruth_inspect_repository` when the user needs orientation or a bounded map.
2. Call `opstruth_audit_repository` when the user requests a broad audit.
3. Use the narrower audit tools only when the request targets one concern.
4. Distinguish verified observations from warnings, skipped checks and facts that remain unverified.
5. State that static inspection does not prove builds, tests, runtime behavior or private provider state.
6. Do not deploy, commit, merge, install packages or claim that the repository was executed.
7. Offer `opstruth_render_evidence` after the evidence is complete when a visual summary would help.

Treat every returned receipt digest as evidence integrity metadata, not proof that the repository is correct.
