# Private exact-commit verification pilot

Status: proposed; disabled without operator secrets. Requires human architecture/security review before activation. This does not enable private repositories in public MCP tools.

## Access boundary

`POST /internal/donestate-private-verification` authenticates a server-only bearer before parsing a body or contacting GitHub. It accepts exactly an account digest and a sealed DoneState v2 handoff. The operator policy admits one account and one repository, pins the immutable repository ID and installation, and expires within seven days. The account digest is SHA-256 of `donestate.private-verification.account.v1\0github:` followed by the authenticated GitHub login in lower case. It is a pseudonymous binding, not anonymisation.

Worker secrets: `OPSTRUTH_PRIVATE_BRIDGE_TOKEN`, `OPSTRUTH_PRIVATE_VERIFICATION_POLICY`, `OPSTRUTH_PRIVATE_GITHUB_APP_ID`, `OPSTRUTH_PRIVATE_GITHUB_APP_PRIVATE_KEY_PEM`. Never put their values in source, public receipts, MCP arguments, shell output or model context. Policy keys are exactly `accountSubjectSha256`, `repository`, `repositoryId`, `installationId`, `issuedAt`, `expiresAt`; IDs are positive decimal strings and timestamps are UTC ISO dates. Repository and installation values are private metadata.

A separate verifier-owned App must be installed on only the approved repository. It must differ from the public bridge App and from the DoneState executor App. Token minting requests Contents, Checks and Commit statuses read; Metadata read is implicit. Returned permissions must all be read and belong to this set. Selected repository count, name, immutable ID, private visibility and token expiry are checked before reads. Static tokens, anonymous fallback, target writes and general private inspection are excluded.

DoneState separately retains a protected policy with exactly `accountSubjectSha256`, `repository`, `issuedAt`, `expiresAt`, the same bridge token, and the canonical private route URL. The principal comes from authenticated run ownership, never objective text. Other repositories continue through the public bridge. Private requests prohibit redirects, time out after 30 seconds, bound the response and retain existing v2 validation and pinned signer admission.

## Threat and privacy review

The principal hash alone confers no access. The server bearer is a trust boundary: possession admits the single configured subject, so a compromised executor service can query that subject until revocation. This is an intentionally bounded operator pilot, not multi-tenant OAuth brokerage. Token compromise, repository transfer, wrong IDs, broad provider permissions, public/private drift, policy expiry and public MCP bypass fail closed. Nonces and signed subject digests preserve DoneState's existing stale-response protection; the route does not add a second durable replay database.

No shared cache, private-route analytics, provider-body errors or new evidence storage is used. Successful reports contain private paths and identifiers and go only to the authenticated DoneState caller; its existing per-owner run, event-chain, verification and account deletion controls retain them. Public GitHub source and receipts must exclude private target metadata. Operator configuration is retained as encrypted Worker secrets until expiry/removal; expiry blocks use but does not itself erase secrets. Admission failures disclose only a fixed error and HTTP status. Audit custody is the caller's existing run/event chain and separate operator deployment/grant/revocation records, not an OpsTruth private graph store. Do not enable request-body logging or credential-bearing traces.

## Activation and revocation

1. Review this authority-sensitive source change and exact CI result.
2. Confirm distinct executor/verifier App IDs, read-only verifier permissions, exact selected installation and authenticated caller authority. Do not reuse an executor token or publish private identifiers.
3. Install operator secrets through a protected, non-model-visible provider path. Confirm signing identity remains the existing pinned verifier identity. No secret provisioning is implemented by this patch.
4. Re-observe App installation, token scope and exact repository ID. Run a bounded PR-only acceptance with explicit execution funding and writer authority. Source CI does not prove this live acceptance.
5. Retain the signed result only in authorised caller custody. Check public MCP cannot reach private credentials, private policy expiry, wrong-account rejection and account cleanup.

Revoke immediately by removing/rotating the bridge token and policy on both services, then remove the selected verifier App installation. No installation token is cached between requests. Provider tokens are short-lived (at most 65 minutes); a provider 401 permits one refresh and scope revalidation. Cancellation/deletion remains a separate DoneState action and is never inferred from verifier access revocation.

General private support, installation self-service, cross-tenant policies, private PR/deployment inspection, new storage and new distribution claims require separate review. This pilot supplies exact-commit evidence only.
