---
name: review-change-safety
description: Review the static safety implications of visible API, migration, environment, secret and deployment changes in a public GitHub repository. Use before implementation, pull-request handoff, migrations, deployment or publication when the user needs evidence about risk boundaries.
---

# Review Change Safety

1. Establish repository identity with `opstruth_inspect_repository`.
2. Select only relevant checks from secrets, environment, API contracts, migrations, GitHub handoff and deployment.
3. If the requested outcome is broad, call `opstruth_plan_workflow` to obtain a least-authority sequence.
4. Describe evidence and consequences without labelling pattern matches as confirmed vulnerabilities.
5. Refuse to expose secret values or accept credentials in arguments.
6. Use current public GitHub CI evidence when available and identify the exact commit it covers.
7. Use `opstruth_prepare_sandbox_verification` to define the fixed commands and isolation requirements when fresh execution is necessary.
8. Stop before write actions or code execution. Explain which separately connected authenticated and approval-gated lane would be required.

Return the safest next action that would close the most important proof gap.
