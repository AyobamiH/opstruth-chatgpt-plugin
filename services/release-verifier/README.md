# OpsTruth independent public release verifier service

## Current source state — 20 October 2026

The isolated verifier supports deterministic, read-only recovery of an already
published release. The committed configuration keeps both public verification
and private recovery disabled. Source tests and a dry build are implementation
evidence; deployment and a genuine signed release decision require separate
runtime evidence. The canonical acceptance record is DoneState
`governance/project-ledger.json`, item `AGENTPROOF-001`. Its publication checkpoint
records release `416342082` published once on 18 October; receipt collection and
independent acceptance stalled afterwards. Later recovery must preserve that
execution, never rewrite the workflow outcome or request another publication.

The 21 existing read-only OpsTruth tools and the original DoneState PR verifier
are unchanged. This isolated service is not an additional public MCP capability.

### Private recovery capability

`src/entrypoint.mjs` exports the named Cloudflare `ReleaseRecovery` entrypoint.
Only a Worker configured with a service binding to that entrypoint can call
`verify({receipt, handoff, observation})`. The default public HTTP Worker exposes
no recovery route and retains its GitHub OIDC and 20-minute receipt policy.

Private recovery requires `READBACK_RECOVERY_ENABLED=true` and exact immutable
configuration for `READBACK_RECOVERY_RUN_ID`,
`READBACK_RECOVERY_GITHUB_RUN_ID`, `READBACK_RECOVERY_TRANSACTION_ID`,
`READBACK_RECOVERY_COMPLETION_DIGEST` and
`READBACK_RECOVERY_AUTHORISATION_DIGEST`. The original workflow remains pinned
in `TRUSTED_SOURCE_SHA`; updated service source belongs in `SERVICE_SOURCE_SHA`.
All existing target and five distinct signer pins remain mandatory. The binding
does not accept a credential, create execution authority, or change any target.

The caller supplies an unchanged Release Receipt V2, a fresh independently
pinned DoneState handoff, and an AgentProof authority-signed
`agentproof.release-readback-attestation.v1` sidecar. The sidecar's distinct
signing domain is the schema followed by a NUL byte and canonical JSON. It binds
the original request, completion, recovery grant, workflow, run, transaction and
subject; its published after-state must exactly match the receipt. It has
`readOnly: true`, a fresh observation time, and an expiry at most five minutes
later. Recovery validates the receipt's historical approval/execution timeline
and both signatures without changing the receipt's timestamps or identity.

OpsTruth then independently reads GitHub metadata and downloads both assets.
The reader supplies a fresh `observedAt`; the release's `publishedAt` remains a
historical event. Both the sidecar and handoff are revalidated after those reads,
immediately before signing; expiry in flight requires a fresh recovery cycle.
Every GET, response body and asset redirect chain shares a
12-second request deadline, in addition to existing byte and redirect limits.
The provenance manifest's 31-day age policy remains enforced. An outage returns
unsigned `UNPROVEN`; changed bytes or expired provenance return unsigned
`CONTRADICTED`; invalid recovery authority returns bounded `BLOCKED` reason
codes. Only successful independent observations produce a signed `VERIFIED`
report. The controller owns retry budgets and settlement; OpsTruth stores no
run history or retry state.

The architectural decision is deterministic Durable Object recovery before
PiHarness, recorded in DoneState ADR 002 and AgentProof's decision log. PiHarness
remains a deferred option for broader persistent agent orchestration.

## Original capability and historical preparation

This separate Cloudflare Worker accepts one GitHub Actions OIDC identity pinned to the protected disposable release-canary repository, immutable repository/owner IDs, exact main workflow commit and one protected environment. It accepts no GitHub publisher token. The independent reader performs GET-only, noncached public GitHub repository, tag, release and allowlisted release-asset downloads; redirects can reach only known GitHub asset hosts and are bounded. Actual package and signed provenance bytes are streamed under strict size limits, SHA-256 hashed and checked against the exact fixed release subject.

The independently configured provenance issuer has an Ed25519 key distinct from AgentProof approval, execution and receipt signers. The release verifier additionally enforces that **all five** configured signer fingerprints (AgentProof approval, AgentProof receipt, DoneState handoff, provenance issuer and OpsTruth release verdict) differ before accepting any caller identity or evidence. The provenance manifest signs the release subject excluding only the provenance asset ID and its own byte digest, avoiding a recursive asset-ID/hash cycle. The *complete* uploaded provenance bytes remain separately bound to the observed asset ID and SHA-256 fingerprint.

The public route checks the full AgentProof Release Receipt V2, including its original signed approval, separate authority and receipt signer fingerprints, the immutable release subject, exact draft/published observations, idempotency bindings and bounded approval/receipt timestamps. A receipt signer alone cannot invent an approved action.

Before any byte verification, a fourth independent Ed25519 identity must sign a DoneState release-verification handoff over the exact DoneState run UUID, AgentProof transaction/receipt/subject digests, authenticated GitHub Actions run ID and short expiry. The public route enforces this against GitHub OIDC instead of signing an arbitrary caller-supplied run UUID. Private recovery uses its exactly pinned predecessor and sidecar bindings. The DoneState handoff signing key must remain separate from AgentProof approval, release receipt and OpsTruth verifier keys.

The verifier also independently checks the AgentProof release receipt signature under a separately pinned signer fingerprint. Only downloaded bytes, signed provenance, exact target metadata and a fresh independent observation allow a VERIFIED observation. Missing provider access returns UNPROVEN, changed bytes or invalid provenance returns CONTRADICTED.

Only after a verified byte observation can this separate service issue a signed, exact-run-bound OpsTruth release decision using a distinct encrypted Worker signing key. An expired, missing, foreign or unsigned decision cannot satisfy DoneState. No private keys, credentials, inspected contents, caller identities or release history are stored by the service; no arbitrary repositories, network targets or mutating GitHub API calls are permitted.

Run npm ci --ignore-scripts, npm run check and npm audit --audit-level=high here, and the normal root OpsTruth checks. Committed Wrangler state is disabled with zero source pin, no target or signing key. A genuine production activation still requires a reviewed exact target, separate issuer/trust pins, a proper real release, trusted signing-key provisioning and independently observed proof.

Historical blocker on 17 October: the environment refused the upstream disposable draft release creation and the credential-bearing orchestration script. At that checkpoint, no actual release, production-signed verification, deployed release-verifier authority or DoneState terminal customer outcome had been accepted.

## 18 October acceptance preparation: exact source identity

At this preparation checkpoint the isolated Worker was deployed disabled, with its own encrypted signing key; the exact disposable draft and separately signed provenance existed. Publication and signed production acceptance were pending then. See the current synopsis for the later publication and recovery boundary.

The health response preserves legacy sourceCommit as the permitted caller-workflow revision and explicitly exposes trustedWorkflowCommit plus serviceSourceCommit for the reviewed OpsTruth build revision. An unconfigured serviceSourceCommit is null. Activation records both exact revisions and the Cloudflare version, and the canary refuses a mismatch in either. This evidence-only metadata change adds no network access, mutation, credential or signing authority. The separate maintenance plane deploys reviewed source; OpsTruth remains GET-only against the inspected release.
