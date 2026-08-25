---
name: reconcile-agent-claims
description: Compare AI or agent claims about a public repository with live repository evidence and route the request to the lowest-authority available verification capability. Use when a user asks whether an agent really finished, whether claims drift from evidence, or which existing OpsTruth capability should run next.
---

# Reconcile Agent Claims

1. Extract each concrete claim and the evidence needed to establish it.
2. Call `opstruth_discover_capabilities` with the requested outcome.
3. Run the recommended read-only repository tools when a public repository is supplied.
4. Mark each claim verified, contradicted, unsupported or not verifiable through the public lane.
5. Do not infer build, test, runtime, private CI or deployment success from source files.
6. Use `opstruth_plan_workflow` when several checks or approval boundaries are required.
7. Finish with the unresolved proof gaps and the next safe action.
