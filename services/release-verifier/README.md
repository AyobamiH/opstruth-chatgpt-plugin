# OpsTruth independent public release verifier service

Status: source-only, disabled by default, not a published or deployed public MCP capability. The 21 existing read-only OpsTruth tools and the original DoneState PR verifier are unchanged.

This separate Cloudflare Worker accepts one GitHub Actions OIDC identity pinned to the protected disposable release-canary repository, immutable repository/owner IDs, exact main workflow commit and one protected environment. It accepts no GitHub publisher token. The independent reader performs GET-only, noncached public GitHub repository, tag, release and allowlisted release-asset downloads; redirects can reach only known GitHub asset hosts and are bounded. Actual package and signed provenance bytes are streamed under strict size limits, SHA-256 hashed and checked against the exact fixed release subject.

The independently configured provenance issuer has an Ed25519 key distinct from AgentProof approval, execution and receipt signers. The provenance manifest signs the release subject excluding only the provenance asset ID and its own byte digest, avoiding a recursive asset-ID/hash cycle. The *complete* uploaded provenance bytes remain separately bound to the observed asset ID and SHA-256 fingerprint.

The verifier also independently checks the AgentProof release receipt signature under a separately pinned signer fingerprint. This is not used as evidence of actual release success: only downloaded bytes, signed provenance, exact target metadata and fresh publication time allow a VERIFIED observation. Missing provider access returns UNPROVEN, changed bytes or invalid provenance returns CONTRADICTED.

Only after a verified byte observation can this separate service issue a signed, exact-run-bound OpsTruth release decision using a distinct encrypted Worker signing key. An expired, missing, foreign or unsigned decision cannot satisfy DoneState. No private keys, credentials, inspected contents, caller identities or release history are stored by the service; no arbitrary repositories, network targets or mutating GitHub API calls are permitted.

Run npm ci --ignore-scripts, npm run check and npm audit --audit-level=high here, and the normal root OpsTruth checks. Committed Wrangler state is disabled with zero source pin, no target or signing key. A genuine production activation still requires a reviewed exact target, separate issuer/trust pins, a proper real release, trusted signing-key provisioning and independently observed proof.

Current blocker on 17 October: the environment refused the upstream disposable draft release creation and the credential-bearing orchestration script. No actual release, production-signed verification, deployed release-verifier authority or DoneState terminal customer outcome has been accepted. The live public OpsTruth plugin must remain untouched.
