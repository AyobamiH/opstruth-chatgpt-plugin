# DoneState reviewer demo verification

Date: 20 October 2026. Maintainer request: complete the real OpenAI reviewer flow.
Change classification: authority-sensitive configuration and maintenance-sensitive deployment.
Status: candidate; no deployed or independently verified result is asserted here.

The reviewer must not operate in the publisher's production repository. The isolated
public fixture is AyobamiH/donestate-review-fixture, immutable GitHub repository ID
1427217995. Its seed commit is ab56672b2f009f152d3dc0c0464add7e9e2f0e8c.
The existing production selection AyobamiH/donestate (1348643925) remains available.

This candidate adds exactly one optional maintainer-configured review fixture, not
a prefix grant. Configuration requires the same owner, a donestate-review- name,
a distinct immutable ID and public visibility. Partial or malformed configuration
fails closed. A caller cannot add another repository or choose credential scope.
Every token still selects one exact repository and only Contents, Checks and
Commit statuses read, with Metadata read. The broker validates identity,
visibility, lifetime and returned permissions; no static or anonymous fallback is
added. The verifier identity, signing key, contract and independence stay unchanged.
No source is imported from the fixture and existing provenance remains intact.

Before activation: review the exact diff, pass npm run check, add this exact
repository to the existing verifier-owned GitHub App installation, and retain
the existing signer fingerprint. The executor uses its own separate installation.
Do not approve the maintainer's own PR. Record source commit, deployment identity,
live route checks and an exact-subject real verification result separately.
The fixture's intentionally wrong invoice total must be fixed by real execution;
synthetic tests, a valid signature, or a prior owner run are not acceptance.

Rollback: remove the two optional REVIEW_REPOSITORY configuration values and the
fixture's installation selection, preserving the original production selection.
No data or signing-key migration is needed.
