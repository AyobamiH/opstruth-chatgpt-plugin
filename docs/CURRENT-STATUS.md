# Current status

As of 2026-08-28, OpsTruth `0.4.0` is the deployed and directory-published independent verification product.

## Verified production identity

- deployed Worker source commit: `255bab7b55b9f6587e3534d3b2afbacb2eed7321`
- deployment workflow: `https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/33210945478` (`success`)
- endpoint: `https://opstruth-chatgpt.woeinvests.workers.dev/mcp`
- public tool count: 21
- authority mode: read-only public evidence
- signer fingerprint: `sha256:09544c3ede70b832a114918bb439960004655faf9d36981e1402587af9429c86`

The DoneState v2 bridge is live. OpsTruth independently re-observed DoneState canary run `631d8a08-d337-4bae-bd18-b55c31f48a8b` and signed the verification report that allowed the separately authorised DoneState coordinator to record `VERIFIED`.

## Maintainer automation

Maintainer bot v0 is active only in this source repository. It has contents-read authority, runs deterministic review evidence, and cannot approve, merge, deploy, sign verification results for its own change, or modify inspected targets.

## Not implemented

Private-repository evidence brokerage, managed longitudinal storage, a verifier fleet, and higher maintainer write stages remain deferred. OpsTruth does not execute repair, merge, deployment, or release actions.
