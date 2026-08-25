const styles = `
  :root{font-family:ui-sans-serif,system-ui,sans-serif;color:#eaf2ff;background:#07101d;color-scheme:dark}
  *{box-sizing:border-box}body{margin:0}main{max-width:860px;margin:auto;padding:64px 24px}
  a{color:#77c7ff}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:1;margin:.3em 0}h2{margin-top:2rem}
  p,li{color:#b8c8db;line-height:1.65}.pill{display:inline-block;border:1px solid #34506f;border-radius:999px;padding:6px 10px;color:#8ed5ff}
  .card{background:#0e1c2d;border:1px solid #263f5e;border-radius:16px;padding:20px;margin:18px 0}code{color:#b7e0ff}
`;

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${styles}</style></head><body><main>${body}</main></body></html>`;
}

export function landingPage(baseUrl) {
  return page("OpsTruth", `<span class="pill">Evidence-first verification</span><h1>Know what the code proves.</h1><p>OpsTruth gives ChatGPT and Codex live, read-only verification tools for public GitHub repositories. It maps structure, routes and contracts, checks visible release risks and returns proof gaps without running or changing the project.</p><div class="card"><strong>MCP endpoint</strong><p><code>${baseUrl}/mcp</code></p><p>13 read-only tools · 6 workflow skills · optional evidence UI</p></div><p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a> · <a href="https://github.com/AyobamiH/opstruth-chatgpt-plugin">GitHub</a></p>`);
}

export function privacyPage() {
  return page("Privacy | OpsTruth", `<span class="pill">Privacy</span><h1>Privacy policy</h1><p>Effective 25 August 2026. OpsTruth is published by AYOBAMI JOHN HAASTRUP.</p><h2>Data processed</h2><p>The public MCP service receives the public GitHub repository identifier and tool arguments that a user deliberately submits. It fetches bounded public repository metadata and source files from GitHub to produce the requested report.</p><h2>Data minimisation</h2><p>The service does not accept private-repository credentials, user tokens or secret values. Environment files and key files are not opened. Secret-like findings are returned only as redacted types and locations.</p><h2>Storage</h2><p>OpsTruth does not create user accounts or persist repository reports. Cloudflare and GitHub may process standard request metadata under their own terms. Public GitHub responses may be cached briefly to protect availability and rate limits.</p><h2>Purpose and sharing</h2><p>Data is processed only to provide repository verification and maintain service reliability. It is not sold or used for advertising.</p><h2>Your choices</h2><p>Submit only public repositories you are comfortable asking the service to inspect. For questions, use the <a href="/support">support page</a>.</p>`);
}

export function termsPage() {
  return page("Terms | OpsTruth", `<span class="pill">Terms</span><h1>Terms of service</h1><p>Effective 25 August 2026.</p><p>OpsTruth provides read-only static observations about public GitHub repositories. Reports are evidence aids, not guarantees of correctness, security, legal compliance, deployability or live runtime behavior.</p><p>Do not use the service to submit credentials, private source code, personal data or repositories you are not authorised to inspect. Do not attempt to bypass GitHub access controls or service limits.</p><p>The public tools do not execute code or change repositories, databases, CI systems or cloud providers. Consequential actions require separate systems and explicit user approval.</p><p>The service is provided without warranty. Verify important findings independently before acting.</p>`);
}

export function supportPage() {
  return page("Support | OpsTruth", `<span class="pill">Support</span><h1>OpsTruth support</h1><p>For incorrect evidence, false positives, connection problems or documentation issues, open a redacted report in <a href="https://github.com/AyobamiH/opstruth-chatgpt-plugin/issues/new">GitHub Issues</a>.</p><p>Include the repository URL, tool name, expected result and the smallest safe evidence excerpt. Never include tokens, private keys, customer data or private source code.</p><p>For sensitive security reports, use GitHub private vulnerability reporting when available. Otherwise request a private channel without posting the sensitive details.</p>`);
}
