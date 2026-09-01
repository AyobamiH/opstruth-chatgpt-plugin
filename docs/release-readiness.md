# OpsTruth 0.4.0 Release Readiness
Candidate: Evidence Graph release
Authority: read-only evidence plane

## Release promise

OpsTruth binds public repository, commit, CI, optional runtime and caller-supplied execution-receipt evidence to exact subjects. It preserves contradictions, reports proof gaps, produces portable signed snapshots, compares compatible snapshots and independently verifies execution outcomes without changing the target system.

## Implemented functionality

- Evidence Graph v1 schema with 256-node, 512-edge and 512 KiB snapshot caps.
- RFC 8785 JSON canonicalisation and domain-separated SHA-256 digests.
- Ed25519 portable snapshot signing and offline verification.
- Deterministic compatible-subject state deltas, including freshness expiry.
- Six deterministic contradiction classes for commit, artifact, deployment, route, receipt and supersession conflicts.
- Runtime schema validation for graphs and all four execution-handoff artifacts.
- Real cryptographic vectors verified by the runtime implementation and a standalone verifier.
- Independent post-execution verification with separate authorizer, executor and verifier identities and role-specific trust allowlists.
- Fail-closed DoneState v2 handoff validation, exact-commit re-observation and domain-separated Ed25519 attestation signing.
- Candidate verifier-owned GitHub App lane for installation-authenticated DoneState reads, restricted to one reviewed public repository with short-lived, scope-validated credentials.
- Candidate complete `donestate.verification-contract.v2` response producer with byte-pinned DoneState report, attestation and deterministic positive/negative vectors.
- Five additive read-only MCP tools: snapshot, compare, verify execution result, expose the public verifier identity and attest DoneState handoff.
- Canonical compatibility locks for all sixteen 0.3.1 public tool contracts.
- Analytics v2 and optional reason-coded feedback with no subject, prompt, URL, receipt, graph, free-text or user identifiers.
- Controlled five-mode product-value evaluation protocol. Results remain explicitly unmeasured until the comparison is run.

## Security and privacy invariants

- No public tool mutates a target repository, CI system, provider, deployment or runtime.
- No public input accepts tokens, passwords, private keys or other credentials.
- General public-repository tools remain anonymous; only the selected DoneState exact-commit bridge may use brokered Metadata, Contents, Checks and Commit-statuses read authority.
- Private repository production access, provider-authenticated deployment verification, managed graph history and Executioner remain deferred.
- Receipt state never determines the independent verification verdict.
- Unknown signer trust, invalid signatures, stale evidence, incompatible subjects and proof gaps fail closed.
- Global nonce reuse remains explicitly unproven in the stateless public plugin.
- Graphs and protocol artifacts are returned to the caller and are not copied into analytics.

## Mandatory local and remote evidence

- `npm run check` passes on the release commit.
- The 0.3.1 tool-contract compatibility test passes.
- Evidence schemas, structural examples and real cryptographic vectors pass.
- Adversarial tamper, signer, subject, expiry, scope and contradiction tests pass.
- Wrangler produces a deployable Worker bundle.
- Pull-request CI and deterministic maintainer review pass on the exact head commit.
- Non-author human review is recorded for authentication, architecture, contracts, workflows and authority-sensitive changes.
- Post-merge CI and Cloudflare deployment pass on the exact main commit.
- Deployment fails before its first write when the three required GitHub App Worker secret names are absent.
- `/health` reports version `0.4.0`, 21 tools, Evidence Graph `1.0.0`, the exact deployed commit and configured selected-repository GitHub App verification.
- `/mcp`, `/signing-key`, `/privacy`, `/terms`, `/support` and reason-coded feedback are freshly checked.
- Internal Worker self-probes and independent runner probes agree for the required deployment routes.
- A new consequence-disabled sealed DoneState canary verifies through authenticated exact-head reads and the complete versioned response contract; historical PR #22 remains unchanged.

## Publication separation

Repository merge, Cloudflare deployment, OpenAI review, visible directory publication, clean-account installation, and a real tool outcome are separate states. Version `0.4.0` is visibly public in the OpenAI Plugins Directory as of 2026-09-01. Its listing still points to the compatibility origin, and clean-account installation and outcome remain unproven.

## Remaining non-code gates

- Merge the reconciled P0 carrier to `main`, then deploy the exact main commit and pass the internal-versus-independent production regression.
- Create and independently review the verifier-owned GitHub App, install it only on `AyobamiH/donestate`, and configure its three Cloudflare Worker secrets before the authenticated canary.
- Obtain non-author architecture/security review for the authority-sensitive authentication, contract and deployment changes.
- Run a fresh consequence-disabled DoneState canary only after exact-commit production read-back succeeds.
- Identify a second trusted human reviewer, then protect `main` with exact PR checks and non-author human approval for protected changes.
- Create a commit-bound plugin tag and release only after the repaired deployed identity is reconciled.
- Run the controlled five-mode product-value comparison before making superiority claims.
- Reconcile the OpenAI listing metadata from the compatibility origin to the reviewed canonical origin when the provider workflow permits it.
