# OpenAI Submission Record
- Product: OpsTruth
- Version: 0.4.0
- Publisher: AYOBAMI JOHN HAASTRUP
- Submission shape: six skills, nineteen read-only MCP tools and optional evidence UI
- MCP URL: https://opstruth-chatgpt.woeinvests.workers.dev/mcp
- Authentication: none
- Data scope: public GitHub repositories, explicitly supplied public HTTPS endpoints and caller-held protocol artifacts
- Target-system writes: none

## New in 0.4.0

- Portable signed Evidence Graph snapshots
- Exact repository, commit and CI subject binding
- Deterministic contradictions and state deltas
- Independent post-execution verification
- Real interoperable protocol signature vectors
- Privacy-safe analytics v2 and reason-coded optional feedback

## Discovery evaluation

`evals/golden-prompts.json` contains eight positive and five negative routing cases. `evals/product-value-matrix.json` defines the unmeasured comparison across ChatGPT alone, ChatGPT with OpsTruth, `npx opstruth`, manual review and the website.

## Review boundary

All advertised MCP tools remain read-only and non-destructive. OpsTruth does not clone or execute repository code. A signed receipt is treated as a claim. A `VERIFIED` execution outcome requires a valid trusted handoff plus fresh subject-bound observations produced under a separate OpsTruth verifier identity.

Private repository credentials, write authority, provider deployment actions and managed evidence history are not part of this release.

## Submission checks

1. Run `npm run check` and the production smoke suite.
2. Confirm 19 tools and six skills are returned from the exact production commit.
3. Exercise snapshot, comparison, tamper rejection and post-execution verification paths.
4. Confirm the privacy page describes graphs, protocol artifacts, analytics v2 and feedback.
5. Submit the 0.4.0 package for OpenAI review.
6. Report directory publication only after the visible directory version is confirmed.
