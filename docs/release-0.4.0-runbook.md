# OpsTruth 0.4.0 Release Runbook

## 1. Freeze the candidate

Record the exact release commit. Require a clean worktree, `npm run check`, a successful Wrangler dry run and no drift in the sixteen 0.3.1 compatibility digests.

## 2. Review through GitHub

Open a pull request to `main`. The contents-read maintainer review and CI must pass on the exact unchanged head SHA. Protected architecture, contracts, workflows and authority files require a human owner.

## 3. Merge with SHA binding

Merge only with the expected PR head SHA. Record the resulting main commit. Never treat the PR state alone as deployment evidence.

## 4. Deploy and verify

The main-branch workflow deploys the Worker with the main commit identity. Require green post-merge CI and deployment, then independently check:

- `/health`: version 0.4.0, 21 tools, Evidence Graph 1.0.0 and exact commit;
- `/mcp`: protocol-aware POST initialisation and complete read-only tool list; never use a generic GET health probe;
- `/signing-key`: configured Ed25519 identity;
- `/privacy`, `/terms` and `/support`: HTTP 200;
- `/feedback`: controlled reason codes only;
- live signed snapshot: correct graph schema, digest and signer fingerprint.

The deployed regression must also invoke `opstruth_probe_deployment` from inside the Worker for `/health`, `/privacy`, `/terms`, and `/support`, probe the same routes independently from the workflow runner, and require matching successful status classes. Any internal 522, omitted route, transport ambiguity, or contradiction fails the deployment gate.

## 5. Rollback criteria

Roll back to the last verified Worker version when any boundary, compatibility, signing, graph-integrity, subject-binding, privacy or route smoke gate fails. A rollback is a maintenance-plane deployment and must retain its own exact commit evidence.

## 6. OpenAI publication

Upload and submit the 0.4.0 plugin snapshot only after production verification. OpenAI review and directory publication remain distinct. Confirm the visible directory version before announcing publication.
