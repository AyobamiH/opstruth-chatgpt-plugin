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
- Pull-request CI and contents-read maintainer review pass on the exact head commit.
- Post-merge CI and Cloudflare deployment pass on the exact main commit.
- Deployment fails before its first write when the three required GitHub App Worker secret names are absent.
- `/health` reports version `0.4.0`, 21 tools, Evidence Graph `1.0.0`, the exact deployed commit and configured selected-repository GitHub App verification.
- `/mcp`, `/signing-key`, `/privacy`, `/terms`, `/support` and reason-coded feedback are freshly checked.
- A new sealed DoneState canary verifies through authenticated exact-head reads; historical PR #22 remains unchanged.

## Publication separation

Repository merge, Cloudflare deployment, OpenAI review and visible ChatGPT directory publication are separate states. Do not claim directory publication until version 0.4.0 is visible in the published listing.

## Remaining non-code gates

- Protect `main` with required CI, maintainer-review and human approval rules.
- Create and independently review the verifier-owned GitHub App, install it only on `AyobamiH/donestate`, and configure its three Cloudflare Worker secrets.
- Obtain architecture/security review for the authority-sensitive authentication and deployment changes, then perform exact-commit deployment and a fresh canary.
- Run the controlled five-mode product-value comparison before making superiority claims.
- Complete OpenAI review and confirm visible directory version 0.4.0.
