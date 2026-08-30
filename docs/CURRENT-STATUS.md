# Current status

As of 2026-08-30, OpsTruth `0.4.0` is the deployed and directory-published independent verification product on its owned service domain.

## Verified production identity

- deployed Worker source commit: `915ab91110bddf520551b318723baac49213e33a`
- pull-request CI: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33299933644` (`success`)
- maintainer review: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33299933712` (`success`)
- post-merge CI: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33300000121` (`success`)
- deployment workflow: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33300000143` (`success`)
- deployed Cloudflare version: `4a5ef5ed-fad8-48a4-9d2b-5eaeb4ad4bfe`
- canonical endpoint: `https://mcp.opstruth.io/mcp`
- compatibility endpoint: `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`
- public tool count: 21
- authority mode: read-only public evidence
- signer fingerprint: `sha256:09544c3ede70b832a114918bb439960004655faf9d36981e1402587af9429c86`

The DoneState v2 bridge is live. OpsTruth independently re-observed DoneState canary run `631d8a08-d337-4bae-bd18-b55c31f48a8b` and signed the verification report that allowed the separately authorised DoneState coordinator to record `VERIFIED`.

The owned-domain deployment completed through PR #7. Production smoke passed against `https://mcp.opstruth.io`, reporting version `0.4.0`, exact commit `915ab91110bddf520551b318723baac49213e33a`, 21 read-only tools, and a signed Evidence Graph. See [Owned-domain cutover evidence](OWNED-DOMAIN-CUTOVER.md).

The prior verified production baseline remains part of the audit trail: source `255bab7b55b9f6587e3534d3b2afbacb2eed7321`, deployment workflow `33210945478`. It is superseded as the current deployment but not deleted from historical evidence.

## Active DoneState verification incident

Fresh canary `b4242932-0bc1-4876-a202-634d9c12d72a` remains `AWAITING_VERIFICATION` at DoneState PR #22, exact head `ffec48e6c5abd9cef840ab591896613769d3e779`. The three sealed checks later became publicly visible as successful, but the latest signed OpsTruth decision remained `uncertain`.

Source inspection confirms that OpsTruth already addressed the sealed head SHA. The observed retry sequence instead overlapped the shared five-minute cache for volatile GitHub check responses, so a pending observation could outlive the provider-side transition to success. The remediation candidate bypasses that cache for exact-commit checks and statuses, requires exact-name `completed/success` outcomes, adds `github_checks_*` reason codes and includes a pending-to-success regression test. This is not recorded as deployed or as a successful canary rerun until exact-commit CI, merge, deployment and a new signed DoneState result are directly observed.

## Maintainer automation

Maintainer bot v0 is active only in this source repository. It has contents-read authority, runs deterministic review evidence, and cannot approve, merge, deploy, sign verification results for its own change, or modify inspected targets.

## Not implemented

Private-repository evidence brokerage, managed longitudinal storage, a verifier fleet, and higher maintainer write stages remain deferred. OpsTruth does not execute repair, merge, deployment, or release actions.
