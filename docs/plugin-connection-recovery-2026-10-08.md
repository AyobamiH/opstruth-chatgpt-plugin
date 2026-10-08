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

## Verified initial MCP draft progress

A separate unpublished OpsTruth Verification draft was created on 8 October
2026 using the supported initial MCP ZIP flow. Its package name is
`opstruth-verification`; the source compatibility package remains `opstruth`.
The existing published OpsTruth skills listing was preserved.

Draft: https://platform.openai.com/plugins/manage/plugin_asdk_app_6ac7fd26659081918b2c8145fbb424e5

The platform accepted the corrected required listing URLs, all six skill scans
passed, domain verification passed, and the anonymous canonical MCP connection
was configured. Native discovery found all 21 tools. Ten public GitHub readers
were flagged because openWorldHint was false despite external network reads.
The candidate fixes those annotations with read-only/non-destructive flags
preserved and a bounded compatibility migration; deployment and native rescan
remain pending recorded non-author review.

The required five positive and three negative review-case definitions were
imported. Their successful live execution and the required real walkthrough
recording have not been completed. A privacy-policy finding remains to be
reconciled against the reviewed live server. No review submission, approval,
customer installation, customer tool outcome or publication is claimed.


## Privacy disclosure completion

The candidate policy now identifies Cloudflare hosting/Analytics Engine and GitHub public-source requests, scopes excluded data to application analytics, states the Analytics Engine three-month event retention and the five-minute public GitHub cache lifetime, and describes DNT/GPC as a direct-MCP-client control. The Analytics Engine retention was checked against https://developers.cloudflare.com/analytics/analytics-engine/limits/ on 8 October 2026; the cache lifetime is declared in src/github.js. No collection, credential, target authority or storage mechanism is expanded by these wording corrections. This remains candidate policy text until reviewed and deployed; the native privacy finding is not declared resolved.
