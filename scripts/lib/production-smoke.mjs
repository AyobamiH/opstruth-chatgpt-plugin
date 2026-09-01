export function mcpRequest(id, method, params = {}) {
  return {
    path: "/mcp",
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    },
  };
}

function statusClass(status) {
  return Number.isInteger(status) ? Math.floor(status / 100) : null;
}

export function compareInternalAndExternalProbes({ endpoint, paths, externalStatuses, internalReport }) {
  const errors = [];
  if (!internalReport || internalReport.status !== "healthy") {
    errors.push(`internal deployment probe: expected healthy, got ${internalReport?.status || "missing"}`);
  }
  const byPath = new Map();
  for (const probe of internalReport?.probes || []) {
    let path = null;
    try { path = new URL(probe.requestedUrl).pathname; } catch { /* reported below as an omitted path */ }
    if (path) byPath.set(path, probe);
  }
  for (const path of paths) {
    const internal = byPath.get(path);
    const external = externalStatuses[path];
    if (!internal) {
      errors.push(`internal deployment probe: ${path} was omitted`);
      continue;
    }
    if (internal.status === 522) errors.push(`internal deployment probe: ${path} returned Cloudflare 522`);
    if (!internal.ok || statusClass(internal.status) !== 2) {
      errors.push(`internal deployment probe: ${path} was not successful (${internal.status ?? "no status"})`);
    }
    if (statusClass(external) === null) errors.push(`independent deployment probe: ${path} had no status`);
    else if (statusClass(internal.status) !== statusClass(external)) {
      errors.push(`deployment probe contradiction: ${path} internal ${internal.status ?? "missing"}, independent ${external}`);
    }
    try {
      if (new URL(internal.requestedUrl).origin !== endpoint) errors.push(`internal deployment probe: ${path} used an unexpected origin`);
    } catch {
      errors.push(`internal deployment probe: ${path} returned an invalid requested URL`);
    }
  }
  return errors;
}
