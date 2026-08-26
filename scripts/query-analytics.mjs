const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_ANALYTICS_READ_TOKEN;
if (!accountId || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_READ_TOKEN (Account Analytics:Read) before querying usage.");
  process.exit(1);
}

const days = Math.min(90, Math.max(1, Number.parseInt(process.env.OPSTRUTH_ANALYTICS_DAYS || "7", 10) || 7));
const query = `
SELECT blob2 AS tool, blob3 AS outcome, blob4 AS client, blob5 AS version,
       COUNT() AS calls, AVG(double1) AS avg_latency_ms,
       SUM(CASE WHEN double2 >= 200 AND double2 < 300 THEN 1 ELSE 0 END) AS responses
FROM opstruth_usage
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
GROUP BY tool, outcome, client, version
ORDER BY calls DESC
`;
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!response.ok) {
  console.error(`Cloudflare Analytics Engine query failed with status ${response.status}`);
  process.exit(1);
}
const result = await response.json();
if (!result.success) {
  console.error(JSON.stringify(result.errors || result));
  process.exit(1);
}
console.table(result.result?.data || []);
