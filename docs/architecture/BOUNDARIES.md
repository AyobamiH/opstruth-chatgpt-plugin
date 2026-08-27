# OpsTruth Authority Constitution

Status: accepted architecture policy
Policy version: 1.0.0
Effective date: 2026-08-27
Owner: OpsTruth maintainers

This document is the highest-authority product boundary for OpsTruth. Code, tools, workflows, roadmaps, and contributions must conform to it. An architecture decision record may clarify this policy but cannot silently override it.

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative.

## Product invariant

OpsTruth is an independent evidence plane. It observes authorised systems, binds evidence to exact subjects, identifies contradictions and proof gaps, and reports what is verified, risky, contradicted, partial, or unproven.

OpsTruth MUST NOT mutate a system it is asked to independently verify.

This invariant is about the authority exercised against the inspected system. It does not prohibit maintainers from changing the OpsTruth source repository or deploying the OpsTruth service under a separate maintenance policy.

## Authority planes

| Plane | Component | Authority | Purpose |
| --- | --- | --- | --- |
| Evidence | OpsTruth | Read-only against inspected systems | Observe, correlate, compare, and verify evidence |
| Execution | Executioner or another compatible runner | Explicit, scoped write authority | Perform approved changes and emit claims plus evidence |
| Maintenance | `opstruth-maintainer` | Scoped authority over this repository only | Keep OpsTruth reviewed, tested, and aligned with this constitution |

No credential, identity, signing key, or approval in one plane automatically grants authority in another.

## Inspected systems

An inspected system is any external or user-controlled subject about which OpsTruth is asked to make a verification claim. Examples include:

- source repositories and pull requests;
- CI systems, checks, artifacts, and build metadata;
- deployed applications, provider state, and runtime endpoints;
- configuration, migrations, routes, contracts, and environment declarations;
- execution receipts produced by agents, runners, or future Executioner implementations.

The OpsTruth source repository and the OpsTruth production Worker are not inspected systems when they are being maintained. They become inspected systems when OpsTruth is asked to audit them, and the normal non-mutation rule then applies during that verification run.

## Permitted evidence-plane capabilities

OpsTruth MAY:

- inspect public repositories;
- inspect authenticated private repositories through brokered read-only authority;
- read current CI, pull-request, deployment, and runtime evidence;
- make bounded requests to explicitly supplied public HTTPS endpoints;
- identify visible configuration and secret-exposure risk without returning secret values;
- construct deterministic evidence graphs and signed evidence snapshots;
- compare caller-supplied or policy-approved prior snapshots;
- detect contradictions, staleness, missing subject bindings, and proof gaps;
- prepare a non-authoritative ActionRequest for a separately authorised executor;
- verify authorization, execution receipt, and evidence signatures;
- independently re-observe state after execution and issue a verification result.

## Prohibited evidence-plane capabilities

OpsTruth MUST NOT:

- modify an inspected repository or create a branch, commit, tag, issue, or pull request in it;
- approve or merge a pull request in an inspected repository;
- modify inspected CI, configuration, environment variables, infrastructure, data, or secrets;
- deploy, roll back, restart, remediate, or otherwise operate an inspected application;
- execute arbitrary repository code in the public plugin;
- grant, infer, or expand execution authority;
- turn a read-only credential into a write credential;
- accept credentials, tokens, private keys, session secrets, or secret values as public tool inputs;
- report an executor claim as independently verified without fresh subject-bound evidence;
- describe signature validity as proof that an action was authorised, safe, successful, or currently deployed.

Adding any prohibited capability requires a separate execution product. It is not an OpsTruth feature flag or authenticated mode.

## Private repository access

Private visibility is not write authority. A future private-repository integration MAY belong in OpsTruth when all of the following hold:

1. Access is mediated by an installed provider application or equivalent credential broker.
2. Granted permissions are explicitly read-only and minimal for the requested evidence.
3. Raw credentials never enter MCP arguments, model context, reports, logs, analytics, snapshots, or receipts.
4. Repository identity and permission scope are recorded without disclosing sensitive metadata.
5. Revocation, expiry, tenant isolation, and audit logging are defined before production use.
6. The integration fails closed when it cannot prove the granted scope.

For GitHub, the intended baseline is metadata read, contents read, actions read, and pull requests read. Contents write, workflows write, pull requests write, deployments write, secrets, and administration permissions are prohibited for the evidence plane.

## Runtime observation

Read-only HTTP methods are intentions, not mathematical guarantees. A misconfigured endpoint can attach side effects to any request. Runtime probing therefore MUST:

- require an explicitly supplied target;
- use bounded HEAD or GET requests only;
- validate every redirect target;
- reject credentials, local addresses, IP literals, and unsupported protocols;
- retain only the response metadata required for the claim;
- never treat a successful response as proof of deployment identity without a subject binding.

## Evidence and receipts

Every material claim SHOULD identify:

- the exact subject, including repository, commit, environment, deployment, or artifact identity where applicable;
- the source and observation time;
- the authority under which the evidence was obtained;
- the evidence digest and freshness policy;
- what was not observed or could not be bound to the subject.

A receipt is a signed claim. Signature verification proves integrity and signer possession of a key. It does not prove authorization, signer trust, safe execution, outcome correctness, or current state.

OpsTruth MUST independently re-observe the requested assertions before returning `VERIFIED` after an execution. When re-observation is incomplete, the result MUST be `PARTIAL`, `CONTRADICTED`, or `UNPROVEN`.

## Portable state and privacy

OpsTruth 0.4.0 remains stateless by default. Longitudinal comparison is based on signed, portable snapshots supplied by the caller or retrieved through a separately approved storage design.

OpsTruth MUST NOT add server-side storage of repository identities, URLs, prompts, user identifiers, private metadata, or evidence graphs without a separate privacy, retention, tenant-isolation, deletion, and threat-model review.

Aggregate analytics MUST remain unable to reconstruct a repository, user, prompt, ActionRequest, or execution history.

## Maintenance-plane exception

Humans and `opstruth-maintainer` MAY maintain this repository under `docs/maintainers/BOT.md`. That authority is separate from the public product authority.

The maintainer bot MUST:

- be scoped to this repository;
- start with contents read access only;
- surface evidence and required human decisions;
- never approve its own pull request;
- never autonomously change protected governance, workflow, signing, credential, release, or authority files;
- never use its repository authority against a system under independent OpsTruth inspection.

## Change classification

Every change must be classified before merge:

| Class | Example | Required review |
| --- | --- | --- |
| Evidence-only | New static observation or report field | Normal maintainer review plus tests |
| Authority-sensitive | New tool, input, network target, private access, receipt rule | Architecture and security review |
| Contract-sensitive | Schema or canonicalization change | Compatibility, fixture, and migration review |
| Maintenance-sensitive | Workflow, bot policy, signing, deployment | Human owner review |
| Prohibited | Target write, remediation, deployment, approval | Reject or move to execution plane |

## Enforcement

This policy is enforced through:

- `AGENTS.md` instructions;
- `scripts/check-boundaries.mjs` and architecture tests;
- versioned schemas under `contracts/`;
- CODEOWNERS and pull-request review policy;
- the maintainer review workflow;
- release gates in `docs/roadmap/0.4.0.md`.

Documentation is not sufficient by itself. Any architecture rule that can be checked deterministically SHOULD become a failing CI check.

## Escalation rule

If a requested feature could both observe and mutate the same inspected subject, it does not belong in OpsTruth. Define an ActionRequest, require separate authorization, execute it outside OpsTruth, then ask OpsTruth to re-observe the result.
