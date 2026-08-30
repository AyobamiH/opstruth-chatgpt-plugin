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
