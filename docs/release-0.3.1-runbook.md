# OpsTruth 0.3.1 release runbook

The local release commit is the current `HEAD` (the commit containing this runbook). Run the following from the repository root after authenticating to GitHub:

```sh
git push origin HEAD:main
```

The deploy workflow then runs the full check suite, deploys with the commit SHA in `OPSTRUTH_BUILD_COMMIT`, provisions the stable signing key if needed, redeploys and smoke-tests `/health`, `/privacy`, `/terms`, `/support` and MCP initialization.

## Protect `main`

In GitHub repository Settings → Branches, add a rule for `main` with:

- Require status checks before merging: `verify` (strict/up-to-date enabled).
- Disable force pushes and branch deletion.
- Keep the CI-first exception documented as an administrator-only emergency path; normal changes go through a pull request.

## Analytics owner query

Create a Cloudflare API token with `Account Analytics:Read`, then run:

```sh
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_ANALYTICS_READ_TOKEN=...
OPSTRUTH_ANALYTICS_DAYS=30 npm run analytics
```

The output is aggregate calls by tool, outcome, client family and version. It is not a unique-user counter. Do not add a user identifier or raw request data to the dataset.

## GitHub release

After the remote commit and green workflow are visible, create `v0.3.1` targeting that exact commit and attach the repository source archive or release manifest. The tag must point to the deployed commit shown by `/health`; do not describe a release as deployed until that check passes.

## OpenAI directory and showcase

Upload the updated `.codex-plugin` package and skills snapshot, use the production MCP URL, rerun the five positive and three negative prompts, and resubmit for review. OpenAI reviews the snapshot, so metadata or skill changes require a new scan and publication. The developer showcase copy is in `docs/showcase-submission.md`.
