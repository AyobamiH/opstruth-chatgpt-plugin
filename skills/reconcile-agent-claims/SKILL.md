---
name: reconcile-agent-claims
description: Use this when a user asks whether an AI or agent really finished a public-repository task, whether claims drift from live evidence, or which lowest-authority verification capability should run next. Do not treat static files, signatures or one health response as proof of execution or correctness.
---

# Reconcile Agent Claims

1. Extract each concrete claim and the evidence needed to establish it.
2. Call `opstruth_discover_capabilities` with the requested outcome.
3. Run the recommended read-only repository tools when a public repository is supplied.
4. Mark each claim verified, contradicted, unsupported or not verifiable through the public lane.
5. Check current public GitHub Actions and check-run evidence before classifying CI claims as unsupported.
6. Probe a user-supplied public HTTPS health endpoint before classifying a live deployment claim, but do not infer application correctness from one successful response.
7. Do not infer build, test, runtime, private CI or deployment success from source files.
8. Use `opstruth_prepare_sandbox_verification` for an approval-gated execution handoff when static and public CI evidence cannot settle a build or test claim.
9. Use `opstruth_plan_workflow` when several checks or approval boundaries are required.
10. Use `opstruth_snapshot_evidence` when all observations must be bound to one exact subject. Use `opstruth_compare_snapshots` only for two caller-held Evidence Graph v1 snapshots of the same immutable repository identity.
11. If a complete ActionRequest, ActionAuthorization and ExecutionReceipt chain is supplied with separate authoritative authorizer and executor fingerprint allowlists, call `opstruth_verify_execution_result` for fresh independent verification. Never infer success from the receipt state.
12. Finish with the unresolved proof gaps and the next safe action.
