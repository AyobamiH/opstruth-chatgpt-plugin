export const EVIDENCE_UI_URI = "ui://opstruth/evidence-v1.html";

export const EVIDENCE_UI_HTML = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OpsTruth evidence</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; --background:#0d0f10; --surface:#131618; --surface-elevated:#191c1f; --foreground:#eceeef; --muted:#a0a5aa; --border:#2b2f32; --border-strong:#3a3f43; --pass:#76b995; }
    body { margin: 0; background: var(--background); color: var(--foreground); }
    main { padding: 18px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1 { font-size: 20px; margin: 0; }
    .badge { border: 1px solid var(--border-strong); border-radius: 999px; padding: 4px 9px; color: var(--pass); font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin: 16px 0; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 12px; }
    .value { font-size: 24px; font-weight: 750; }
    .label { color: var(--muted); font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
    h2 { font-size: 14px; color: var(--muted); margin: 18px 0 8px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 6px 0; line-height: 1.35; }
    .warning { color: #ffd58a; }
    .failure { color: #ff9f9f; }
    .muted { color: var(--muted); }
    .feedback { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    button { background: var(--surface-elevated); color: var(--foreground); border: 1px solid var(--border-strong); border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button:hover { background: var(--surface); }
    button:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
    button:disabled { cursor: default; opacity: .55; }
    @media (max-width: 520px) { .grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  </style>
</head>
<body>
<main>
  <header><h1>OpsTruth evidence</h1><span class="badge" id="status">Waiting</span></header>
  <p class="muted" id="repo">Run an OpsTruth evidence tool, then render its report.</p>
  <p class="muted" id="scope"></p>
  <section class="grid">
    <div class="card"><div class="value" id="verifiedCount">0</div><div class="label">Verified</div></div>
    <div class="card"><div class="value" id="warningCount">0</div><div class="label">Warnings</div></div>
    <div class="card"><div class="value" id="failureCount">0</div><div class="label">Failures</div></div>
    <div class="card"><div class="value" id="gapCount">0</div><div class="label">Not verified</div></div>
  </section>
  <h2>Verified evidence</h2><ul id="verified"></ul>
  <h2>Warnings</h2><ul id="warnings" class="warning"></ul>
  <h2>Proof gaps</h2><ul id="gaps" class="muted"></ul>
  <section class="feedback" aria-label="Result feedback">
    <button data-reason="useful">Useful</button>
    <button data-reason="missed_evidence">Missed evidence</button>
    <button data-reason="false_warning">False warning</button>
    <button data-reason="unclear_result">Unclear</button>
    <button data-reason="incorrect_binding">Incorrect binding</button>
    <span class="muted" id="feedbackStatus" role="status"></span>
  </section>
</main>
<script>
  const byId = (id) => document.getElementById(id);
  const list = (id, values) => {
    const node = byId(id); node.replaceChildren();
    for (const value of values || []) { const li = document.createElement('li'); li.textContent = String(value); node.append(li); }
  };
  const render = (report) => {
    if (!report) return;
    const graph = report.schema === 'opstruth.evidence-graph' ? report : report.evidenceGraph;
    const result = report.result || report;
    const assertions = graph?.summary?.assertionResults || result.assertionResults || [];
    const scope = graph?.nodes?.find((node) => node.type === 'finding' && node.attributes?.kind === 'assessment_scope')?.attributes;
    const verified = report.verified || assertions.filter((item) => item.verdict === 'VERIFIED').map((item) => item.explanation);
    const warnings = report.warnings || result.warnings || (graph?.summary?.contradictions || []).map((item) => item.description);
    const failures = report.failures || result.errors || [];
    const gaps = report.notVerified || result.notVerified || assertions.filter((item) => item.verdict === 'UNPROVEN').map((item) => item.explanation);
    byId('status').textContent = graph?.summary?.verdict || result.verdict || report.status || 'complete';
    byId('repo').textContent = report.repository?.fullName || graph?.subject?.repositoryName || result.subject?.repositoryName || report.title || 'OpsTruth report';
    byId('scope').textContent = scope?.statement || '';
    byId('verifiedCount').textContent = verified.length;
    byId('warningCount').textContent = warnings.length;
    byId('failureCount').textContent = failures.length;
    byId('gapCount').textContent = gaps.length;
    list('verified', verified); list('warnings', warnings); list('gaps', gaps);
  };
  for (const button of document.querySelectorAll('button[data-reason]')) {
    button.addEventListener('click', async () => {
      for (const candidate of document.querySelectorAll('button[data-reason]')) candidate.disabled = true;
      try {
        const response = await fetch('/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: button.dataset.reason, surface: 'mcp' }) });
        byId('feedbackStatus').textContent = response.ok ? 'Feedback recorded.' : 'Feedback unavailable.';
      } catch { byId('feedbackStatus').textContent = 'Feedback unavailable.'; }
    });
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
  }, { passive: true });
  if (window.openai?.toolOutput) render(window.openai.toolOutput);
</script>
</body>
</html>`.trim();

export function evidenceResource(baseUrl) {
  return {
    uri: EVIDENCE_UI_URI,
    mimeType: "text/html;profile=mcp-app",
    text: EVIDENCE_UI_HTML,
    _meta: {
      ui: {
        prefersBorder: true,
        domain: baseUrl,
        csp: { connectDomains: [baseUrl], resourceDomains: [] },
      },
    },
  };
}
