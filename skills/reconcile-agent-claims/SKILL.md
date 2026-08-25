---
name: reconcile-agent-claims
description: Compare AI or agent claims about a public repository with live repository evidence and route the request to the lowest-authority available verification capability. Use when a user asks whether an agent really finished, whether claims drift from evidence, or which existing OpsTruth capability should run next.
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
10. Finish with the unresolved proof gaps and the next safe action.
