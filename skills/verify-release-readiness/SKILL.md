---
name: verify-release-readiness
description: Assess whether a public GitHub repository has visible evidence for release or deployment handoff without deploying it. Use for release readiness, CI readiness, GitHub handoff, deployment preflight, packaging evidence or questions about whether AI-generated work is ready to publish.
---

# Verify Release Readiness

Require a public GitHub repository URL or `owner/name`.

1. Call `opstruth_check_github_handoff` for current public GitHub Actions, check-run, commit-status, branch-protection, contribution and handoff evidence.
2. Call `opstruth_check_deployment` for static deployment configuration and platform indicators.
3. Call `opstruth_review_migrations` when database migrations are present.
4. Call `opstruth_review_api_contracts` when release safety depends on APIs or schemas.
5. Call `opstruth_probe_deployment` only when the user supplies the public HTTPS deployment URL and the relevant health paths.
6. Call `opstruth_prepare_sandbox_verification` when fresh build, test or typecheck evidence is still required. Present its exact repository commit and commands for approval in a separately connected runner.
7. Summarize blockers, warnings and missing proof. Never convert a static configuration match, historical CI run or health response into broader application correctness.
8. Stop before execution, release, deployment, publication, migration or provider mutation in the public plugin.

Conclude with one of: ready for live validation, not ready, or insufficient evidence.
