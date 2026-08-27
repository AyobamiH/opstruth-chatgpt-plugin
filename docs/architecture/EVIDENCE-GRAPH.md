# Evidence Graph v1

Status: 0.4.0 design target
Graph schema target: `opstruth.evidence-graph` 1.0.0

## Purpose

OpsTruth currently collects useful evidence signals. Evidence Graph v1 adds the subject binding needed to answer a harder question: do the repository, commit, CI run, artifact, deployment, runtime observation, finding, and receipt describe the same state?

The graph is an evidence model, not a generic knowledge graph and not an autonomous planning system.

## Design goals

- Bind every claim to an exact subject and observation time.
- Preserve source, authority, freshness, and digest provenance.
- Express contradictions and missing links without inventing certainty.
- Produce deterministic, signed, portable snapshots.
- Compare two snapshots without requiring central storage.
- Keep private identifiers out of aggregate analytics.

## Non-goals for 0.4.0

- Server-side customer graph retention.
- An executor, remediation engine, or deployment controller.
- Probabilistic confidence scores presented as proof.
- Automatic approval of proposed actions.
- A universal software bill of materials or asset inventory.

## Graph envelope

An evidence graph contains:

```json
{
  "schema": "opstruth.evidence-graph",
  "schemaVersion": "1.0.0",
  "graphId": "urn:uuid:...",
  "createdAt": "2026-08-27T12:00:00Z",
  "subject": {},
  "policy": {},
  "nodes": [],
  "edges": [],
  "summary": {},
  "digest": "sha256:...",
  "proof": {}
}
```

The digest excludes `proof` and is computed from canonical JSON with an explicit domain separator. Array ordering rules must be defined before signing. Implementations must reject duplicate node or edge identifiers.

## Node model

Every node must contain:

| Field | Purpose |
| --- | --- |
| `id` | Stable identifier within the graph |
| `type` | Controlled node type |
| `subjectRef` | Exact object the evidence describes |
| `source` | Provider, document, endpoint, or receipt origin |
| `observedAt` | RFC 3339 observation time |
| `authority` | Read scope or signer context used to obtain it |
| `freshUntil` | Policy-derived expiry, or `null` when no freshness claim is made |
| `digest` | Digest of canonical evidence content |
| `status` | `OBSERVED`, `CLAIMED`, `STALE`, `INVALID`, or `UNAVAILABLE` |
| `attributes` | Type-specific bounded data |

Allowed v1 node types:

- `repository`
- `commit`
- `branch`
- `pull_request`
- `ci_run`
- `artifact`
- `deployment`
- `runtime_observation`
- `configuration`
- `finding`
- `action_request`
- `action_authorization`
- `execution_receipt`
- `verification_result`

New node types require a minor graph-schema version and fixtures. Renaming or changing the meaning of an existing type requires a major version.

## Edge model

Every edge must identify `from`, `to`, `type`, `source`, `observedAt`, and `digest`. An edge is an evidence-backed assertion, not an inferred visual connection.

Allowed v1 edge types:

- `contains`
- `derived_from`
- `tested_by`
- `produced`
- `deployed_as`
- `observed_by`
- `addresses`
- `claims`
- `authorizes`
- `verifies`
- `contradicts`
- `supersedes`

An inferred edge must be marked `basis: "inferred"` and must list the evidence nodes supporting the inference. Inferred edges cannot independently produce a `VERIFIED` result.

## Subject identity

Human-readable names are not sufficient bindings.

Examples of minimum subject identity:

| Subject | Required identity |
| --- | --- |
| Repository | Provider plus immutable provider repository ID |
| Commit | Repository identity plus full commit SHA |
| CI run | Provider run ID plus head commit SHA |
| Artifact | Producer run plus content digest |
| Deployment | Provider deployment ID, environment, and deployed commit or artifact digest |
| Runtime observation | Normalized origin, path, observation time, and declared environment |
| Receipt | Schema version, payload digest, and signer fingerprint |

A deployment that cannot be bound to a commit or artifact may be observed, but it cannot prove that the requested commit is live.

## Verdict model

Graph-wide and assertion-level verdicts are:

- `VERIFIED`: all required evidence is valid, fresh, and bound to the exact subject;
- `PARTIAL`: some required assertions are verified and others are missing or stale;
- `CONTRADICTED`: valid evidence sources make incompatible claims about the same subject or expected state;
- `UNPROVEN`: evidence is insufficient to establish the assertion.

`RISKY` remains a report classification for exposed hazards. It is not a substitute for an evidence verdict.

## Contradiction rules

Contradiction detection must be deterministic. Initial rules include:

1. A CI run claims commit A while the deployment claims commit B for the same release assertion.
2. A receipt claims artifact digest A while the provider exposes artifact digest B.
3. A requested route is present in source evidence but absent from a fresh runtime observation that is bound to the same deployment.
4. Two current deployment observations claim different active revisions for a single-slot environment.
5. A receipt signer or authorization digest differs from the identity bound in the ActionRequest.
6. A later valid snapshot supersedes an earlier claim while the earlier claim is still presented as current.

Conflicting evidence must be retained in the graph. The implementation must not discard the less convenient observation to manufacture consistency.

## Snapshot and delta

An evidence snapshot is an immutable signed graph. A delta compares two valid snapshots and reports:

- added, removed, changed, stale, and newly contradicted nodes;
- added or removed subject bindings;
- verdict transitions;
- source or authority changes;
- freshness changes;
- assertions that can no longer be verified.

The comparison operation must first validate both snapshot signatures, graph versions, subject compatibility, and canonical digests. A caller may compare unsigned snapshots, but the result must say that snapshot integrity is unverified.

## Privacy and retention

Portable snapshots are returned to the caller. OpsTruth 0.4.0 does not require central graph storage.

Graphs may contain private repository metadata. They must not be copied into aggregate analytics, logs, error telemetry, or public receipts. Any future managed storage requires a separate data classification, retention, deletion, tenant-isolation, access-control, and breach-response design.

## Failure behavior

- Unknown node or edge semantics fail schema validation.
- Missing subject identity yields `UNPROVEN`.
- Stale evidence cannot satisfy a current-state assertion.
- Invalid signatures remain visible as invalid evidence and cannot support verification.
- Source unavailability is recorded, not silently retried into a different authority path.
- Digest or canonicalization disagreement yields `CONTRADICTED` or schema failure, never `VERIFIED`.

## 0.4.0 acceptance criteria

Evidence Graph v1 is complete only when:

1. A versioned JSON Schema and valid and invalid fixtures exist.
2. Canonicalization and digest test vectors are published.
3. At least one repository to commit to CI to deployment graph is produced deterministically.
4. Missing commit-to-deployment binding returns `UNPROVEN`.
5. Conflicting commit evidence returns `CONTRADICTED`.
6. Signed snapshots can be verified without network access.
7. Two compatible snapshots can produce a deterministic delta.
8. No graph contents enter aggregate analytics.
9. Existing 0.3.1 tools remain read-only and backward compatible.

## Implemented public operations

- `opstruth_snapshot_evidence` builds and signs a bounded caller-held graph from current public observations.
- `opstruth_compare_snapshots` verifies subject compatibility and reports a deterministic delta without network access.
- `opstruth_verify_execution_result` validates a complete handoff chain against separate authorizer and executor trust allowlists, enforces signer-role separation, and performs fresh independent observation before signing a VerificationResult.

The runtime implementation is in `src/evidence-graph.js`, canonicalisation in `src/canonical.js`, protocol verification in `src/protocol.js`, and deterministic post-execution evaluation in `src/post-execution.js`. Graph and delta schemas are under `schemas/`.
