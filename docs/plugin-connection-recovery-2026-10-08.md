# OpsTruth directory connection recovery

## Observed problem

On 8 October 2026, the downloaded published OpsTruth 0.4.1 ZIP had six skills but no MCP configuration or manifest MCP reference. Its publisher portal displayed “No MCPs connected”. Skill agent dependencies alone did not establish a bundled connection.

This candidate adds a root .mcp.json and its compatibility-manifest reference. It declares only https://mcp.opstruth.io/mcp, without headers, credentials or local commands. It preserves existing tool schemas, skills and package identity. No new directory publication is claimed.

## Publication gate

OpenAI's current submission guidance says adding an MCP server to an existing skills-only plugin is unsupported:
https://developers.openai.com/plugins/deploy/submission

Use a supported provider migration or a separately reviewed initial MCP-backed submission. Preserve the current listing until a replacement has actual installation/tool evidence, and reconcile marketing links afterwards. Do not silently overwrite the existing listing, create app-reference shortcuts or treat a ZIP as a connected server.

Required evidence: fresh health/MCP/privacy/terms/support checks, a connected tool scan, five positive and three negative workflow tests, a real walkthrough recording and installed-plugin acceptance in a new signed-in chat. On 8 October, this maintenance client received Cloudflare HTTP 403 / error 1010 before tool execution, and the ChatGPT browser was signed out. Live acceptance remains unproven; no security controls were weakened.

## Privacy and diagnosis

The candidate suppresses tool and feedback telemetry for DNT: 1 / Sec-GPC: 1. Labels are fixed allowlists; unknown caller tool names collapse to unknown. An appended blob10 classifies errors as tool_not_found, input_invalid, signing_unavailable or other. Successes use none. Earlier fields retain their positions; no prompt, subject, error message, upstream body or user identity is stored.

Historical records lack this category and cannot be backfilled or reclassified. Owner/test calls without privacy suppression remain mixed with usage. Neither these aggregate calls nor website listing clicks establish installations or unique users.

The source tests exercise unknown labels, fixed error categories, both suppression headers, MCP HTTP-200 error semantics and unrecorded feedback acknowledgement. Source/CI success is separate from deployment and live directory acceptance.
