# GitHub App verification read lane

Status: implementation candidate for issue #11; not deployment evidence

## Boundary

The GitHub App lane exists only for `opstruth_attest_donestate_handoff` exact-commit evidence against the reviewed public repository `AyobamiH/donestate`. General repository inspection and audit tools remain anonymous and public-only. The lane does not support private repositories, arbitrary caller-selected repositories, repository writes, Actions reads, pull-request reads, deployments, webhooks, administration, secrets, or workflow permissions.

The selected repository is committed as the non-secret `OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY` and `OPSTRUTH_GITHUB_APP_ALLOWED_REPOSITORY_ID` Worker variables. The caller cannot supply or override either value through MCP. A name mismatch fails before OpsTruth signs an App JWT or mints an installation token. The broker and metadata read must also match immutable GitHub repository ID `1348643925`, so delete-and-recreate name reuse cannot silently change the verification subject.

## Endpoint-derived permissions

| GitHub endpoint | Required GitHub App permission |
| --- | --- |
| `POST /app/installations/{installation_id}/access_tokens` | App JWT; token broker only |
| `GET /repos/{owner}/{repo}` | Metadata: read, granted implicitly |
| `GET /repos/{owner}/{repo}/commits/{sha}` | Contents: read |
| `GET /repos/{owner}/{repo}/git/trees/{sha}` | Contents: read |
| `GET /repos/{owner}/{repo}/compare/{base}...{head}` | Contents: read |
| `GET /repos/{owner}/{repo}/contents/{path}?ref={head}` | Contents: read |
| `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` | Checks: read |
| `GET /repos/{owner}/{repo}/commits/{sha}/status` | Commit statuses: read |

The installation-token request narrows access to the single repository name and requests only Contents, Checks, and Commit statuses read. The broker rejects a response that is not repository-selected, does not return exactly that one public repository, omits a required read permission, adds another permission, grants any write permission, or returns an invalid expiry. The authenticated metadata read must match the selected token repository by immutable provider repository ID as well as owner/name and public visibility.

## Credential lifecycle

OpsTruth signs an RS256 GitHub App JWT with a lifetime of ten minutes, including one minute of clock-skew allowance. It uses that JWT to mint a repository-restricted installation token. A returned token must expire in more than 30 seconds and no more than 65 minutes. The token is held only inside one verification client and is never placed in the Cache API.

An evidence request that receives `401` invalidates the token and permits one refresh for the whole client. A second `401` fails closed. Primary and secondary rate-limit responses use at most two retries and at most two seconds of delay per retry; a longer provider window becomes the typed `rate_limited` observation limitation instead of blocking a Worker indefinitely. Permission, scope, authentication, malformed-response, and provider failures use fixed messages that do not include response bodies or credential material.

Exact requested file content is read through the authenticated Contents API at `ref=<sealed head SHA>`. OpsTruth validates file type, path, tree blob SHA, encoding, declared byte size, one-MiB file limit, and aggregate evidence limits. The verification lane never calls `raw.githubusercontent.com`.

## Configuration and disclosure

An owner configures these values directly as Cloudflare Worker secrets; no values belong in Git, GitHub Actions secrets, MCP inputs, logs, analytics, reports, receipts, errors, or cache keys:

- `OPSTRUTH_GITHUB_APP_ID`
- `OPSTRUTH_GITHUB_APP_INSTALLATION_ID`
- `OPSTRUTH_GITHUB_APP_PRIVATE_KEY_PEM`

The deployment workflow checks only that those secret names already exist in Cloudflare before its first deploy. It does not provision or print their values. `/health` discloses only:

```json
{
  "mode": "github_app_installation",
  "configured": true,
  "scope": "selected_public_repository"
}
```

Partial or malformed configuration reports `configured: false`. App ID, installation ID, repository name, key, JWT, and token remain absent.

## Owner-controlled provisioning and recovery

Before deployment, a human owner must create a verifier-owned GitHub App separate from DoneState and any executor, disable unneeded features, grant only Metadata/Contents/Checks/Commit-statuses read, install it only on `AyobamiH/donestate`, and configure the three Cloudflare secrets out of band. These are external permission and secret operations; this repository does not perform them.

For routine key rotation, create the replacement App private key, update the Cloudflare secret, verify `/health` and a fresh sealed canary, then revoke the prior key. If a key is suspected compromised, revoke it first, replace the Worker secret, redeploy the reviewed commit, and use a new DoneState run. Do not rewrite or re-attest historical run `b4242932-0bc1-4876-a202-634d9c12d72a` or PR #22.

Uninstalling the App, removing the selected repository, reducing a required permission, or revoking its key must make verification block or remain unproven; it must never fall back to a static token or anonymous verification reads. Merge, App creation, installation, secret configuration, deployment, rollback, and canary acceptance remain human-owner actions with separate review evidence.
