# Independent release.v1 byte/provenance verification kit

**Source-only, read-only contract candidate (17 October 2026). It is not deployed, not a public MCP tool, not a signed OpsTruth production attestation, and not a DoneState VERIFIED claim.**

This kit supports the next Proof & State / AgentProof release consequence without permitting OpsTruth to publish, repair, or modify a release. It consumes an injected **read-only** reader implementing `observe(subject)` and `downloadAsset(id, maxBytes)`. A future broker must enforce GET-only requests, selected-repository read permissions, bounded bytes, no redirects to unreviewed hosts, no caching, no credential values in arguments, and independent identity. No live GitHub reader is configured in this source-only candidate.

## Sealed subject and independent observation

The subject fixes the exact GitHub owner, repository and numeric IDs, the release ID, immutable tag and commit, package/provenance asset IDs and SHA-256 digests. It is distinct from the executor or AgentProof signed receipt. All input fields are structurally closed.

The verifier independently fetches current release metadata plus **actual package and provenance bytes**, hashes both bounded byte buffers and compares the result to the fixed subject. It also validates a signed provenance JSON manifest whose Ed25519 signer fingerprint must be provisioned **out of band**. The manifest signs the immutable subject excluding its own provenance-byte digest (to avoid a recursive hash cycle) and the package SHA-256. The complete provenance bytes are bound separately by the subject's `provenanceDigest`. The signer must be a separately trusted release/provenance issuer, not an AgentProof self-asserted result.

Every output has `independentAttestationIssued:false`. `VERIFIED` from this kit means **byte and pinned-provenance observation only**. It does not mean production OpsTruth has independently signed a DoneState verification decision. A missing fetch, limit breach or unconfigured trust returns `UNPROVEN`; wrong bytes, wrong tag/repository, stale released state or invalid provenance returns `CONTRADICTED`. A valid AgentProof receipt is not accepted as proof that the released bytes match.

The kit is framework-neutral, stateless, does not write to a repo, store subject identities, retain credential values, call external APIs directly or sign production attestations. Fixtures use disposable in-memory data and generated signing keys only. The live OpsTruth Worker, its GitHub App scope, signing identity and its existing exact-commit DoneState v2 verification contract are unchanged.

## Remaining production gates

1. Integrate through a **separate**, readonly GitHub API/asset download broker with narrow read permissions and safe binary redirect validation; never reuse the DoneState-only verifier GitHub App grant for an unrelated release repository.
2. Pin the real source, package asset, provenance asset and authorised provenance signing issuer; independently verify actual file bytes, tag commit, provenance statement and freshness.
3. Introduce an action-specific, signed OpsTruth release decision binding the exact DoneState release handoff and the digest of this read-only observation. Do not retrofit or weaken existing PR-based `donestate.verification-contract.v2` records.
4. Prove an isolated GitHub Release live canary with separate AgentProof release authority, durable effect fencing and independently configured OpsTruth signing. Never describe the existing repository-patch Worker as release authority.
5. Keep the 10-independent-installation adoption target separate. Synthetic tests and source code are not external adoption evidence.

## Local acceptance

From repository root: `node --test test/release-v1-independent.test.js`, `npm run check:boundaries`, then `npm run check`. Merging this kit does not trigger the production deployment workflow, whose path filter covers `src/**` but not `verification-kits/**` or `test/**`.
