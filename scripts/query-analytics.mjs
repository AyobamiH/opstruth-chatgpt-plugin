import { pathToFileURL } from "node:url";

export function buildAnalyticsQueries(value = "7") {
  const days = Math.min(90, Math.max(1, Number.parseInt(value, 10) || 7));
  return {
    days,
    usage: `
SELECT blob2 AS tool, blob3 AS outcome, blob4 AS client, blob5 AS version,
       blob6 AS verdict, blob7 AS ci_signal,
       blob8 AS deployment_signal, blob9 AS signing_signal,
       SUM(_sample_interval) AS calls,
       SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms,
       SUM(_sample_interval * double3) / SUM(_sample_interval) AS avg_evidence_count,
       SUM(_sample_interval * double4) / SUM(_sample_interval) AS avg_warning_count,
       SUM(_sample_interval * double5) / SUM(_sample_interval) AS avg_failure_count,
       SUM(_sample_interval * double6) / SUM(_sample_interval) AS avg_not_verified_count,
       SUM(if(double2 >= 200 AND double2 < 300, _sample_interval, 0)) AS transport_responses
FROM opstruth_usage
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY AND blob1 = 'tool_call'
GROUP BY tool, outcome, client, version, verdict, ci_signal, deployment_signal, signing_signal
ORDER BY calls DESC
FORMAT JSON
`,
    feedback: `
SELECT blob2 AS reason, blob3 AS surface, blob4 AS version,
       SUM(_sample_interval) AS responses
FROM opstruth_usage
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY AND blob1 = 'feedback'
GROUP BY reason, surface, version
ORDER BY responses DESC
FORMAT JSON
`,
  };
}

export async function queryAnalytics(sql, { accountId, token, fetchImpl = fetch } = {}) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || "") || !token) {
    throw new Error("Set a valid CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_READ_TOKEN (Account Analytics:Read).");
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
      body: sql,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Cloudflare Analytics Engine request failed or timed out.");
  }
  if (!response.ok) {
    // Provider bodies can echo query inputs. Never print them or the credential.
    throw new Error(`Cloudflare Analytics Engine query failed with status ${response.status}`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Cloudflare Analytics Engine returned invalid JSON.");
  }
  // The SQL endpoint returns {meta, data, rows}, not the REST success/result envelope.
  if (!Array.isArray(result?.data)) {
    throw new Error("Cloudflare Analytics Engine returned an unexpected response.");
  }
  return result.data;
}

export async function main(env = process.env) {
  const { days, usage, feedback } = buildAnalyticsQueries(env.OPSTRUTH_ANALYTICS_DAYS);
  const config = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    token: env.CLOUDFLARE_ANALYTICS_READ_TOKEN,
  };
  const usageRows = await queryAnalytics(usage, config);
  const feedbackRows = await queryAnalytics(feedback, config);
  console.log(`OpsTruth bounded analytics for the last ${days} day(s)`);
  console.log("Sampling-weighted calls; outcome is tool success/error. HTTP 200 does not establish tool success.");
  console.table(usageRows);
  console.log("Reason-coded feedback");
  console.table(feedbackRows);
  console.log("Calls include owner/test traffic; client labels are coarse and do not count people or installations.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
