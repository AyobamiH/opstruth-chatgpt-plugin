const styles = `
  :root{
    color-scheme:dark;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --background:#0d0f10;
    --surface:#131618;
    --surface-elevated:#191c1f;
    --foreground:#eceeef;
    --muted:#a0a5aa;
    --border:#2b2f32;
    --border-strong:#3a3f43;
    --pass:#76b995;
    --focus:#7f8992;
    background:var(--background);
    color:var(--foreground)
  }
  *{box-sizing:border-box}
  html{min-height:100%;background:var(--background)}
  body{min-height:100vh;margin:0;background:var(--background);color:var(--foreground);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body::before{position:fixed;inset:64px 0 0;z-index:0;background-image:linear-gradient(to right,rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.025) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 74% 60% at 50% 0%,#000 26%,transparent 82%);content:"";pointer-events:none}
  a{color:inherit;text-underline-offset:4px}
  a:focus-visible{outline:2px solid var(--focus);outline-offset:4px;border-radius:4px}
  code,.mono,.eyebrow,.pill,.stat dt,.footer-links,.version{font-family:"JetBrains Mono","SFMono-Regular",Consolas,"Liberation Mono",monospace}
  .site-header{position:relative;z-index:2;border-bottom:1px solid rgba(43,47,50,.75);background:rgba(13,15,16,.88);backdrop-filter:blur(12px)}
  .header-inner{display:flex;min-height:64px;max-width:1152px;margin:0 auto;padding:0 24px;align-items:center;justify-content:space-between;gap:24px}
  .brand{display:inline-flex;min-height:44px;align-items:center;gap:9px;text-decoration:none}
  .wordmark{font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;font-size:15px;letter-spacing:-.04em}
  .wordmark .truth{color:var(--pass)}
  .version{color:var(--muted);font-size:11px;white-space:nowrap}
  .github-link{display:inline-flex;min-height:44px;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:7px;background:var(--surface);font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;font-size:13px;text-decoration:none;transition:border-color .18s ease,background .18s ease}
  .github-link:hover{border-color:var(--border-strong);background:var(--surface-elevated)}
  main{position:relative;z-index:1}
  .shell{max-width:1152px;margin:0 auto;padding:72px 24px 88px}
  .hero{max-width:900px}
  .signal-row{display:flex;align-items:center;flex-wrap:wrap;gap:14px}
  .mark-plate{display:inline-flex;width:58px;height:58px;align-items:center;justify-content:center;border:1px solid var(--border-strong);border-radius:12px;background:var(--surface-elevated);box-shadow:0 0 40px -14px rgba(118,185,149,.44)}
  .pill{display:inline-flex;min-height:36px;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--border);border-radius:999px;background:rgba(19,22,24,.82);color:var(--muted);font-size:12px}
  .pill::before{width:6px;height:6px;border-radius:50%;background:var(--pass);content:""}
  h1{max-width:820px;margin:26px 0 0;font-size:clamp(2.65rem,7.2vw,5rem);font-weight:540;line-height:.99;letter-spacing:-.055em}
  h1 .muted{display:block;color:var(--muted);font-weight:500}
  .lede{max-width:760px;margin:24px 0 0;color:var(--muted);font-size:clamp(1rem,2vw,1.15rem);line-height:1.75}
  .endpoint{max-width:900px;margin-top:38px;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:0 30px 80px -46px rgba(0,0,0,.85)}
  .endpoint-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 17px;border-bottom:1px solid var(--border);background:rgba(13,15,16,.55)}
  .eyebrow{margin:0;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  .readonly{color:var(--pass);font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;font-size:11px}
  .endpoint-body{padding:20px 18px 22px}
  .endpoint code{display:block;max-width:100%;overflow-wrap:anywhere;color:var(--foreground);font-size:clamp(.86rem,2vw,1rem);line-height:1.6}
  .endpoint-note{margin:12px 0 0;color:var(--muted);font-size:.9rem;line-height:1.6}
  .stats{display:grid;max-width:900px;margin:22px 0 0;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--border);grid-template-columns:repeat(4,minmax(0,1fr));gap:1px}
  .stat{min-width:0;padding:17px;background:var(--surface)}
  .stat dt{color:var(--muted);font-size:10px;letter-spacing:.07em;text-transform:uppercase}
  .stat dd{margin:6px 0 0;font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;font-size:15px;overflow-wrap:anywhere}
  .content{max-width:820px}
  .content h1{font-size:clamp(2.7rem,7vw,4.8rem)}
  .content h2{margin:0;font-size:1.15rem;letter-spacing:-.015em}
  .content>p{color:var(--muted);font-size:1.06rem;line-height:1.75}
  .policy-grid{display:grid;margin-top:42px;gap:14px}
  .policy-section{padding:24px;border:1px solid var(--border);border-radius:9px;background:var(--surface)}
  .policy-section p{margin:12px 0 0;color:var(--muted);line-height:1.75}
  .site-footer{position:relative;z-index:1;border-top:1px solid var(--border);background:var(--background)}
  .footer-inner{display:flex;max-width:1152px;margin:0 auto;padding:25px 24px;align-items:center;justify-content:space-between;gap:22px}
  .footer-links{display:flex;flex-wrap:wrap;gap:18px;color:var(--muted);font-size:12px}
  .footer-links a:hover{color:var(--foreground)}
  @media(max-width:760px){.shell{padding-top:48px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.version{display:none}.footer-inner{align-items:flex-start;flex-direction:column}.github-label{display:none}}
  @media(max-width:440px){.header-inner,.shell,.footer-inner{padding-left:18px;padding-right:18px}.stats{grid-template-columns:1fr}.endpoint-head{align-items:flex-start;flex-direction:column}.mark-plate{width:52px;height:52px}h1{font-size:2.55rem}}
`;

const logoMark = (size = 28) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x=".5" y=".5" width="31" height="31" rx="6.5" fill="var(--surface-elevated)" stroke="var(--border-strong)"/><path d="M8 9 15 16 8 23" stroke="var(--muted)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="m14 17 4.5 5L25 11" stroke="var(--pass)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const header = `<header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="OpsTruth home">${logoMark()}<span class="wordmark"><span>ops</span><span class="truth">truth</span></span><span class="version">v0.4.0 · read-only</span></a><a class="github-link" href="https://github.com/AyobamiH/opstruth-chatgpt-plugin" aria-label="OpsTruth MCP on GitHub"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4"/><path d="M8 19c-3 .9-3-1.5-4-2"/></svg><span class="github-label">GitHub</span></a></div></header>`;

const footer = `<footer class="site-footer"><div class="footer-inner"><a class="brand" href="/" aria-label="OpsTruth home">${logoMark(25)}<span class="wordmark"><span>ops</span><span class="truth">truth</span></span></a><nav class="footer-links" aria-label="Service links"><a href="/signing-key">signing key</a><a href="/privacy">privacy</a><a href="/terms">terms</a><a href="/support">support</a></nav></div></footer>`;

function page(title, body, className = "content") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d0f10"><title>${title}</title><style>${styles}</style></head><body>${header}<main class="shell ${className}">${body}</main>${footer}</body></html>`;
}

function section(title, body) {
  return `<section class="policy-section"><h2>${title}</h2><p>${body}</p></section>`;
}

export function landingPage(baseUrl) {
  return page("OpsTruth", `<section class="hero"><div class="signal-row"><span class="mark-plate">${logoMark(40)}</span><span class="pill">public MCP · read-only · evidence-first</span></div><h1>Know what the code proves.<span class="muted">Preserve what it cannot.</span></h1><p class="lede">OpsTruth gives ChatGPT and Codex live, read-only verification tools for public GitHub repositories. Evidence Graph v1 binds repositories, commits, CI, runtime observations and execution receipts to exact subjects, preserves contradictions and returns portable signed snapshots without changing the target project.</p><section class="endpoint" aria-labelledby="endpoint-title"><div class="endpoint-head"><p class="eyebrow" id="endpoint-title">MCP endpoint</p><span class="readonly">read-only</span></div><div class="endpoint-body"><code>${baseUrl}/mcp</code><p class="endpoint-note">Signed evidence snapshots, deterministic state deltas, and explicit proof gaps—without target-system writes.</p></div></section><dl class="stats"><div class="stat"><dt>Public tools</dt><dd>21</dd></div><div class="stat"><dt>Workflow skills</dt><dd>6</dd></div><div class="stat"><dt>Target writes</dt><dd>0</dd></div><div class="stat"><dt>Evidence model</dt><dd>signed</dd></div></dl></section>`, "landing");
}

export function privacyPage() {
  return page("Privacy | OpsTruth", `<p class="eyebrow">Privacy</p><h1>Privacy policy</h1><p>Effective 27 August 2026. OpsTruth is published by AYOBAMI JOHN HAASTRUP.</p><div class="policy-grid">${section("Data processed", "The public MCP service receives the public GitHub repository identifier, public HTTPS health URL, caller-held evidence snapshots and protocol artifacts that a user deliberately submits. It fetches bounded public repository, CI and response-header evidence to produce the requested report.")}${section("Data minimisation", "The service does not accept private-repository credentials, user tokens or secret values. Environment files and key files are not opened. Secret-like findings are returned only as redacted types and locations. Deployment response bodies are not retained.")}${section("Aggregate usage analytics", "For reliability and product improvement, Cloudflare Analytics Engine receives bounded aggregate fields only: tool, outcome, verdict, capped evidence and gap counts, CI and deployment-probe flags, signing status, rounded latency, plugin version and coarse client family. Optional feedback records one controlled reason code and surface. Prompts, repository names, URLs, IP addresses, graph contents, receipts, free text and stable user identifiers are not recorded.")}${section("Storage", "OpsTruth does not create user accounts or persist user reports, snapshots or evidence graphs. Portable snapshots are returned to the caller. Cloudflare and GitHub may process standard request metadata under their own terms. Public GitHub responses may be cached briefly to protect availability and rate limits.")}${section("Evidence signing", "Reports and Evidence Graph snapshots may include an Ed25519 signature generated with a Cloudflare Worker secret. The public verification key and fingerprint are returned so integrity and signer trust can be checked independently. Signature validity does not prove that an executor was authorised or that its claimed outcome occurred.")}${section("Purpose and sharing", "Data is processed only to provide repository verification, maintain service reliability and improve the tool. It is not sold or used for advertising.")}${section("Your choices", 'Submit only public repositories, public HTTPS endpoints and protocol artifacts you are comfortable asking the service to inspect. Feedback is optional. For questions, use the <a href="/support">support page</a>.')}</div>`);
}

export function termsPage() {
  return page("Terms | OpsTruth", `<p class="eyebrow">Terms</p><h1>Terms of service</h1><p>Effective 25 August 2026.</p><div class="policy-grid">${section("Evidence, not a guarantee", "OpsTruth provides read-only static, public CI and bounded HTTPS health observations. Reports and signatures are evidence aids, not guarantees of correctness, security, legal compliance, deployability or broader runtime behavior.")}${section("Authorised inputs", "Do not use the service to submit credentials, private source code, personal data or repositories and endpoints you are not authorised to inspect. Do not attempt to bypass GitHub access controls, network boundaries or service limits.")}${section("Read-only boundary", "The public tools do not execute repository code or change repositories, databases, CI systems or cloud providers. Sandbox execution requires a separate authenticated runner, isolated environment and explicit user approval.")}${section("Service basis", "The service is provided without warranty. Verify important findings independently before acting.")}</div>`);
}

export function supportPage() {
  return page("Support | OpsTruth", `<p class="eyebrow">Support</p><h1>OpsTruth support</h1><p>Get help with evidence quality, connection problems, or documentation.</p><div class="policy-grid">${section("Report an issue", 'For incorrect evidence, false positives, connection problems or documentation issues, open a redacted report in <a href="https://github.com/AyobamiH/opstruth-chatgpt-plugin/issues/new">GitHub Issues</a>.')}${section("Include safely", "Include the repository URL, tool name, expected result and the smallest safe evidence excerpt. Never include tokens, private keys, customer data or private source code.")}${section("Sensitive reports", "For sensitive security reports, use GitHub private vulnerability reporting when available. Otherwise request a private channel without posting the sensitive details.")}</div>`);
}
