import test from "node:test";
import assert from "node:assert/strict";
import { landingPage, privacyPage, supportPage, termsPage } from "../src/pages.js";
import { EVIDENCE_UI_HTML } from "../src/ui.js";

test("public identity pages share the OpsTruth design system", () => {
  const pages = [
    landingPage("https://mcp.opstruth.io"),
    privacyPage(),
    termsPage(),
    supportPage(),
  ];

  for (const html of pages) {
    assert.match(html, /ops<\/span><span class="truth">truth/);
    assert.match(html, /--pass:#76b995/);
    assert.match(html, /class="site-header"/);
    assert.match(html, /class="site-footer"/);
    assert.match(html, /href="\/signing-key"/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/support"/);
  }
});

test("landing page exposes the canonical endpoint and read-only boundary", () => {
  const html = landingPage("https://mcp.opstruth.io");
  assert.match(html, /https:\/\/mcp\.opstruth\.io\/mcp/);
  assert.match(html, /21/);
  assert.match(html, /Target writes<\/dt><dd>0/);
  assert.match(html, /read-only/);
});

test("embedded evidence UI uses the same operational palette", () => {
  assert.match(EVIDENCE_UI_HTML, /--background:#0d0f10/);
  assert.match(EVIDENCE_UI_HTML, /--pass:#76b995/);
  assert.doesNotMatch(EVIDENCE_UI_HTML, /#08111f|#101d2f|#162944/);
});
