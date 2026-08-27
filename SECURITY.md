# Security

Report security issues through the support contact published at the production `/support` route. Do not include credentials or secret values in reports.

The public MCP server is read-only. It accepts public GitHub repository identifiers and explicitly supplied public HTTPS deployment URLs. Repository requests are restricted to GitHub-owned hosts. Deployment probes reject non-HTTPS targets, credentials, alternate ports, localhost, local names and IP literals; follow at most three validated redirects; prefer HEAD; and never retain response bodies. Repository inspection is bounded, matching secret values are never returned and repository code is never executed.

Evidence-signing private keys are provisioned as Cloudflare Worker secrets. Only the public key, fingerprint and signature are returned. Sandbox verification output is a handoff contract only; execution requires a separately connected authenticated runner with explicit user approval and isolation.

Evidence Graph and protocol inputs are capped at one MiB per tool call. Graphs are capped at 256 nodes, 512 edges and 512 KiB after signing. Unknown fields, duplicate identifiers, unsupported schema versions, invalid canonical digests, invalid signatures, incompatible subjects and stale observations fail closed. Portable graphs and protocol artifacts are caller-held and are never copied into analytics.

Analytics contains bounded aggregate dimensions only. Optional feedback accepts one controlled reason code and surface in a body capped at one KiB. Free text and subject identifiers are rejected.

`docs/architecture/BOUNDARIES.md` is the authority constitution. OpsTruth must not mutate a system it is asked to independently verify. A future private-repository integration must use brokered read-only permissions and must never expose raw credentials to MCP inputs, model-visible output, analytics, logs, snapshots or receipts.

Action requests grant no execution authority. Authorization must be a separate signed artifact. Execution receipts are claims that require independent subject-bound observation before OpsTruth can return `VERIFIED`.

The verifier, authorizer and executor must use separate signing identities. Receipt success does not control the verification verdict. Replay, expiry, scope expansion, subject mismatch, forged evidence and partial execution remain distinct failure states. The stateless public plugin reports global nonce reuse as unproven unless an external authoritative replay source is supplied by a future design.

`opstruth-maintainer` is separate repository-maintenance automation. Version 0 has contents read permission only. Any expansion of its GitHub permissions, signing access, deployment access or write authority requires a human architecture and security review.
