export const EVIDENCE_UI_URI = "ui://opstruth/evidence-v1.html";

export const EVIDENCE_UI_HTML = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OpsTruth evidence</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #08111f; color: #e7eef9; }
    main { padding: 18px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1 { font-size: 20px; margin: 0; }
    .badge { border: 1px solid #34506f; border-radius: 999px; padding: 4px 9px; color: #9bd3ff; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin: 16px 0; }
    .card { background: #101d2f; border: 1px solid #243b58; border-radius: 12px; padding: 12px; }
    .value { font-size: 24px; font-weight: 750; }
    .label { color: #94a7bd; font-size: 12px; }
    h2 { font-size: 14px; color: #b9cce2; margin: 18px 0 8px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 6px 0; line-height: 1.35; }
    .warning { color: #ffd58a; }
    .failure { color: #ff9f9f; }
    .muted { color: #94a7bd; }
    @media (max-width: 520px) { .grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  </style>
</head>
<body>
<main>
  <header><h1>OpsTruth evidence</h1><span class="badge" id="status">Waiting</span></header>
  <p class="muted" id="repo">Run an OpsTruth evidence tool, then render its report.</p>
  <section class="grid">
    <div class="card"><div class="value" id="verifiedCount">0</div><div class="label">Verified</div></div>
    <div class="card"><div class="value" id="warningCount">0</div><div class="label">Warnings</div></div>
    <div class="card"><div class="value" id="failureCount">0</div><div class="label">Failures</div></div>
    <div class="card"><div class="value" id="gapCount">0</div><div class="label">Not verified</div></div>
  </section>
  <h2>Verified evidence</h2><ul id="verified"></ul>
  <h2>Warnings</h2><ul id="warnings" class="warning"></ul>
  <h2>Proof gaps</h2><ul id="gaps" class="muted"></ul>
</main>
<script>
  const byId = (id) => document.getElementById(id);
  const list = (id, values) => {
    const node = byId(id); node.replaceChildren();
    for (const value of values || []) { const li = document.createElement('li'); li.textContent = String(value); node.append(li); }
  };
  const render = (report) => {
    if (!report) return;
    byId('status').textContent = report.status || 'complete';
    byId('repo').textContent = report.repository?.fullName || report.title || 'OpsTruth report';
    byId('verifiedCount').textContent = (report.verified || []).length;
    byId('warningCount').textContent = (report.warnings || []).length;
    byId('failureCount').textContent = (report.failures || []).length;
    byId('gapCount').textContent = (report.notVerified || []).length;
    list('verified', report.verified); list('warnings', report.warnings); list('gaps', report.notVerified);
  };
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
        csp: { connectDomains: [], resourceDomains: [] },
      },
    },
  };
}
