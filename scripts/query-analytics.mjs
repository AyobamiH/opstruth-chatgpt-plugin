const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_ANALYTICS_READ_TOKEN;
if (!accountId || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_READ_TOKEN (Account Analytics:Read) before querying usage.");
  process.exit(1);
}
const days = Math.min(90, Math.max(1, Number.parseInt(process.env.OPSTRUTH_ANALYTICS_DAYS || "7", 10) || 7));
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;

async function query(sql) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Cloudflare Analytics Engine query failed with status ${response.status}`);
  const result = await response.json();
  if (!result.success) throw new Error(JSON.stringify(result.errors || result));
  return result.result?.data || [];
}

const usage = await query(`
SELECT blob2 AS tool, blob3 AS outcome, blob4 AS client, blob5 AS version,
       COALESCE(blob6, 'none') AS verdict, COALESCE(blob7, 'ci_not_observed') AS ci_signal,
       COALESCE(blob8, 'deployment_not_probed') AS deployment_signal,
       COALESCE(blob9, 'evidence_unsigned') AS signing_signal,
       COUNT() AS calls, AVG(double1) AS avg_latency_ms,
       AVG(double3) AS avg_evidence_count, AVG(double4) AS avg_warning_count,
       AVG(double5) AS avg_failure_count, AVG(double6) AS avg_not_verified_count,
       SUM(CASE WHEN double2 >= 200 AND double2 < 300 THEN 1 ELSE 0 END) AS responses
FROM opstruth_usage
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY AND blob1 = 'tool_call'
GROUP BY tool, outcome, client, version, verdict, ci_signal, deployment_signal, signing_signal
ORDER BY calls DESC
`);

const feedback = await query(`
SELECT blob2 AS reason, blob3 AS surface, blob4 AS version, COUNT() AS responses
FROM opstruth_usage
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY AND blob1 = 'feedback'
GROUP BY reason, surface, version
ORDER BY responses DESC
`);

console.log(`OpsTruth bounded analytics for the last ${days} day(s)`);
console.table(usage);
console.log("Reason-coded feedback");
console.table(feedback);
