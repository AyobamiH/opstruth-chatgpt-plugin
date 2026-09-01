# DoneState verification bridge v1

The bridge consumes `donestate.verification-handoff.v2` and emits `donestate.verification-attestation.v2`. It is an evidence-plane adapter, not an execution or submission channel.

## Exact bindings

- The handoff digest uses `donestate.verification-handoff.v2\0` plus canonical JSON without `handoffDigest`.
- The handoff binds the run, objective, execution snapshot, verification nonce, event-chain head, base commit, head commit, publication subject, acceptance criteria, verification requirements, action idempotency keys, intent digests and result digests.
- The verification report digest uses `opstruth.donestate-verification-report.v1\0` plus the canonical report.
- The attestation signature uses `donestate.verification-attestation.v2\0` plus canonical JSON without `signature`.
- OpsTruth exposes its normal fingerprint as `sha256:<hex>` and the DoneState-compatible fingerprint as the same lowercase `<hex>` value without the prefix.

## Verdict mapping

`verified` requires the exact public commit, every sealed action settled as `SUCCEEDED`, complete acceptance-criterion coverage and every supported requirement independently satisfied. A fresh contradiction produces `failed`. Missing, incomplete, unsupported or rate-limited evidence produces `uncertain`.

Supported requirements are `path_exists`, `path_absent`, `file_contains`, `json_equals`, `changed_files` and `github_checks_pass`. The bridge reads at most twenty explicitly sealed files, retains no response bodies after the invocation and never accepts credentials through tool input.

For `github_checks_pass`, OpsTruth reads check runs and commit statuses freshly for the sealed `subject.headSha`; volatile check state is never served from the five-minute repository cache. Required names are matched exactly. A requirement is `VERIFIED` only when every exact required check is terminal with `success`, `UNPROVEN` while evidence is unavailable, missing or pending, and `CONTRADICTED` for every other terminal conclusion. Each outcome carries a machine-readable `github_checks_*` reason code.

The returned attestation is not submitted automatically. DoneState separately checks the pinned signer fingerprint, run ID, execution snapshot digest, verification nonce, handoff digest, report digest, issuance time and signature before changing state.

## Complete verification response contract v2

The current DoneState acceptance boundary requires one strict response envelope: `{ contractVersion, report, attestation }`, with `contractVersion` fixed to `donestate.verification-contract.v2`. OpsTruth now returns that complete envelope from `opstruth_attest_donestate_handoff`; it does not submit the response back to DoneState or mutate the inspected repository.

The schemas and deterministic `verified`, `failed`, `uncertain`, and negative vectors under `contracts/donestate/` are byte-identical mirrors of DoneState merge commit `9e33a7e4c8505eabd24df775e8292bfaa2906f43` (PR #63). `contracts/donestate/manifest.json` pins the upstream Git blob SHA for every mirrored artifact, and the test suite recomputes those blob identities before consuming the vectors. The older `contracts/vectors/donestate-v2.json` remains a historical handoff/attestation compatibility vector; it is not the complete v2 response contract.

The deterministic vector signer is test-only and has no production authority. Production continues to sign with the independently provisioned OpsTruth Ed25519 identity. Signer rotation, revocation, replay acceptance, freshness enforcement, and DoneState state transitions remain DoneState acceptance responsibilities; OpsTruth's producer responsibility is to emit a complete, internally bound, signed response from fresh read-only evidence.
