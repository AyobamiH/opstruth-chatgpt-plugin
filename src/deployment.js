import { bounded } from "./utils.js";

const MAX_PATHS = 8;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;

function blockedHostname(hostname) {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (!lower || lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(lower) || lower.includes(":")) return true;
  return lower === "metadata.google.internal" || lower === "instance-data.ec2.internal";
}

export function safeDeploymentUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("deployment_url_invalid");
  }
  if (url.protocol !== "https:") throw new Error("deployment_url_must_use_https");
  if (url.username || url.password) throw new Error("deployment_url_must_not_include_credentials");
  if (url.port && url.port !== "443") throw new Error("deployment_url_port_not_allowed");
  if (blockedHostname(url.hostname)) throw new Error("deployment_url_hostname_not_allowed");
  url.hash = "";
  url.search = "";
  return url;
}

function safeHealthPath(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#") || path.length > 200) {
    throw new Error("health_path_invalid");
  }
  return path;
}

async function fetchWithTimeout(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(new Request(url, {
      method,
      redirect: "manual",
      headers: {
        accept: "application/json, text/plain;q=0.9, text/html;q=0.5",
        "user-agent": "opstruth-chatgpt-plugin/0.3.0",
      },
      signal: controller.signal,
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(initialUrl) {
  let current = safeDeploymentUrl(initialUrl);
  const redirects = [];
  const started = Date.now();
  let method = "HEAD";

  for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
    let response = await fetchWithTimeout(current.href, method);
    if ((response.status === 405 || response.status === 501) && method === "HEAD") {
      method = "GET";
      response = await fetchWithTimeout(current.href, method);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (count === MAX_REDIRECTS) throw new Error("deployment_probe_redirect_limit");
      const next = safeDeploymentUrl(new URL(response.headers.get("location"), current).href);
      try { await response.body?.cancel(); } catch { /* body was already closed */ }
      redirects.push(next.href);
      current = next;
      continue;
    }
    try { await response.body?.cancel(); } catch { /* body was already closed */ }
    return {
      requestedUrl: initialUrl,
      finalUrl: current.href,
      method,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      contentType: response.headers.get("content-type"),
      redirects,
      elapsedMs: Date.now() - started,
    };
  }
  throw new Error("deployment_probe_failed");
}

export async function probeDeployment(args = {}) {
  const base = safeDeploymentUrl(args.deployment_url);
  const requestedPaths = Array.isArray(args.health_paths) && args.health_paths.length
    ? bounded(args.health_paths, MAX_PATHS).map(safeHealthPath)
    : [base.pathname && base.pathname !== "/" ? base.pathname : "/health"];
  const paths = [...new Set(requestedPaths)];
  const targets = paths.map((path) => {
    const target = new URL(base.origin);
    target.pathname = path;
    return target.href;
  });
  const probes = [];
  for (const target of targets) {
    try {
      probes.push(await probeUrl(target));
    } catch (error) {
      probes.push({ requestedUrl: target, finalUrl: null, method: "HEAD", status: null, ok: false, contentType: null, redirects: [], error: error.message });
    }
  }
  const passing = probes.filter((probe) => probe.ok);
  return {
    contractVersion: "1.0.0",
    skill: { name: "deployment-health-probe", version: "0.3.0" },
    status: passing.length === probes.length ? "healthy" : passing.length ? "partial" : "unhealthy",
    target: { origin: base.origin, paths },
    probes,
    verified: passing.map((probe) => `HTTPS ${probe.method} ${probe.finalUrl} returned ${probe.status}`),
    warnings: probes.filter((probe) => !probe.ok).map((probe) => `${probe.requestedUrl} did not return a successful HTTPS response.`),
    failures: [],
    skipped: ["Response bodies", "Provider credentials", "Internal service state"],
    notVerified: ["Application correctness", "Database health", "Rollback viability", "Private provider configuration"],
    evidence: probes.map((probe) => ({ summary: "Bounded deployment health response", evidence: [probe] })),
    changedState: { changed: false, summary: "HTTPS health probing only; no response bodies were retained." },
  };
}
