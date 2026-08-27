# Security

Report security issues through the support contact published at the production `/support` route. Do not include credentials or secret values in reports.

The public MCP server is read-only. It accepts public GitHub repository identifiers and explicitly supplied public HTTPS deployment URLs. Repository requests are restricted to GitHub-owned hosts. Deployment probes reject non-HTTPS targets, credentials, alternate ports, localhost, local names and IP literals; follow at most three validated redirects; prefer HEAD; and never retain response bodies. Repository inspection is bounded, matching secret values are never returned and repository code is never executed.

Evidence-signing private keys are provisioned as Cloudflare Worker secrets. Only the public key, fingerprint and signature are returned. Sandbox verification output is a handoff contract only; execution requires a separately connected authenticated runner with explicit user approval and isolation.

`docs/architecture/BOUNDARIES.md` is the authority constitution. OpsTruth must not mutate a system it is asked to independently verify. A future private-repository integration must use brokered read-only permissions and must never expose raw credentials to MCP inputs, model-visible output, analytics, logs, snapshots or receipts.

Action requests grant no execution authority. Authorization must be a separate signed artifact. Execution receipts are claims that require independent subject-bound observation before OpsTruth can return `VERIFIED`.

`opstruth-maintainer` is separate repository-maintenance automation. Version 0 has contents read permission only. Any expansion of its GitHub permissions, signing access, deployment access or write authority requires a human architecture and security review.
