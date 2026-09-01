# OpsTruth 0.4.0 Release Runbook

## 1. Freeze the candidate

Record the exact release commit. Require a clean worktree, `npm run check`, a successful Wrangler dry run and no drift in the sixteen 0.3.1 compatibility digests.

## 2. Provision the verification identity separately

The owner creates a verifier-owned GitHub App that is separate from DoneState and any executor. Install it only on `AyobamiH/donestate` with Metadata read, Contents read, Checks read and Commit statuses read. Do not grant Actions, Pull requests, Deployments, Administration, Secrets, Workflows, Webhooks or any write permission. Review the endpoint map and failure behavior in [GitHub App verification read lane](github-app-verification.md).

Configure `OPSTRUTH_GITHUB_APP_ID`, `OPSTRUTH_GITHUB_APP_INSTALLATION_ID` and `OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM` directly as Cloudflare Worker secrets. Do not put their values in source, pull-request text, GitHub Actions secrets, command arguments, logs or test fixtures. Confirm that `wrangler.jsonc` still pins `OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY` to `AyobamiH/donestate` and `OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID` to `1348643925`. Secret creation and App installation are owner-controlled external actions, not part of the repository merge.

## 3. Review through GitHub

Open a pull request to `main`. CI and the deterministic maintainer review must pass on the exact unchanged head SHA. Authentication, architecture, contracts, workflows and authority-sensitive changes additionally require non-author human review; automated maintainer evidence is not a substitute.

## 4. Merge with SHA binding

Merge only with the expected PR head SHA. Record the resulting main commit. Never treat the PR state alone as deployment evidence.

## 5. Deploy and verify

The main-branch workflow must verify the three GitHub App Worker secret names before its first deploy, then deploy the Worker with the exact main commit identity. Require green post-merge CI and deployment, then independently check:

- `/health`: version 0.4.0, 21 tools, Evidence Graph 1.0.0, exact commit and the safe GitHub verification tuple `github_app_installation / configured=true / selected_public_repository`;
- `/mcp`: protocol-aware POST initialisation and complete read-only tool list; never use a generic GET health probe;
- `/signing-key`: configured Ed25519 identity;
- `/privacy`, `/terms` and `/support`: HTTP 200;
- `/feedback`: controlled reason codes only;
- live signed snapshot: correct graph schema, digest and signer fingerprint.

The deployed regression must also invoke `opstruth_probe_deployment` from inside the Worker for `/health`, `/privacy`, `/terms`, and `/support`, probe the same routes independently from the workflow runner, and require matching successful status classes. Any internal 522, omitted route, transport ambiguity, or contradiction fails the deployment gate.

After those gates pass, create a new consequence-disabled sealed DoneState canary against the exact selected repository and deployed verifier commit. Require authenticated metadata, commit, tree, compare, Contents, checks and status observations to bind to the sealed head, and require the complete `{ contractVersion, report, attestation }` response to pass DoneState's strict acceptance contract. Do not rerun, rewrite or retroactively trust historical run `b4242932-0bc1-4876-a202-634d9c12d72a` or PR #22.

## 6. Rotation, revocation and rollback

For routine GitHub App key rotation, create a replacement key, update the Cloudflare Worker secret, pass health and a fresh canary, then revoke the prior key. For suspected compromise, revoke first, replace the secret, redeploy the reviewed commit and require a new run.

If authentication, permission scope, boundary, compatibility, signing, graph-integrity, subject-binding, privacy or route smoke fails, stop DoneState verification and deploy only a reviewed version that fails closed. Never use the legacy static-token or anonymous verification lane as a success fallback. A rollback is a maintenance-plane deployment and must retain its own exact commit evidence.

## 7. OpenAI publication

Repository merge, Cloudflare deployment, OpenAI review and visible directory publication are separate states. Confirm the visible directory version and canonical service metadata before announcing a repaired release identity.
