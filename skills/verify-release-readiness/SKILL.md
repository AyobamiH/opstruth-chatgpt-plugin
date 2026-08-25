---
name: verify-release-readiness
description: Assess whether a public GitHub repository has visible evidence for release or deployment handoff without deploying it. Use for release readiness, CI readiness, GitHub handoff, deployment preflight, packaging evidence or questions about whether AI-generated work is ready to publish.
---

# Verify Release Readiness

Require a public GitHub repository URL or `owner/name`.

1. Call `opstruth_check_github_handoff` for CI, contribution, testing and handoff evidence.
2. Call `opstruth_check_deployment` for static deployment configuration and platform indicators.
3. Call `opstruth_review_migrations` when database migrations are present.
4. Call `opstruth_review_api_contracts` when release safety depends on APIs or schemas.
5. Summarize blockers, warnings and missing live proof. Never convert a static configuration match into a successful deployment claim.
6. Stop before release, deployment, publication, migration or provider mutation.

Conclude with one of: ready for live validation, not ready, or insufficient evidence.
