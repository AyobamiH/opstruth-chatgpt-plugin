import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyticsQueries, queryAnalytics } from "../scripts/query-analytics.mjs";

const accountId = "a".repeat(32);
const token = "test-only-credential";

test("SQL transport sends raw text and accepts the real SQL response envelope", async () => {
  const sql = "SELECT SUM(_sample_interval) AS calls FROM opstruth_usage FORMAT JSON";
  const rows = [{ calls: "83" }];
  const result = await queryAnalytics(sql, {
    accountId, token,
    fetchImpl: async (url, init) => {
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`);
      assert.equal(init.method, "POST");
      assert.equal(init.headers.authorization, `Bearer ${token}`);
      assert.equal(init.headers["content-type"], "text/plain");
      assert.equal(init.body, sql);
      assert.ok(init.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ meta: [], data: rows, rows: 1 }) };
    },
  });
  assert.deepEqual(result, rows);
});

test("empty SQL data is valid but REST envelopes and malformed responses fail closed", async () => {
  for (const payload of [{ success: true, result: { data: [] } }, {}, null, { data: {} }]) {
    await assert.rejects(queryAnalytics("SELECT 1", {
      accountId, token, fetchImpl: async () => ({ ok: true, json: async () => payload }),
    }), /unexpected response/);
  }
  assert.deepEqual(await queryAnalytics("SELECT 1", {
    accountId, token, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
  }), []);
  await assert.rejects(queryAnalytics("SELECT 1", {
    accountId, token, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error(token); } }),
  }), /^Error: Cloudflare Analytics Engine returned invalid JSON\.$/);
});

test("query failures never disclose provider bodies or network errors", async () => {
  await assert.rejects(queryAnalytics("SELECT 1", {
    accountId, token,
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => { throw new Error(token); } }),
  }), /^Error: Cloudflare Analytics Engine query failed with status 403$/);
  await assert.rejects(queryAnalytics("SELECT 1", {
    accountId, token, fetchImpl: async () => { throw new Error(token); },
  }), /^Error: Cloudflare Analytics Engine request failed or timed out\.$/);
});

test("missing or invalid account configuration cannot make a request", async () => {
  for (const config of [{ token }, { accountId }, { accountId: "../wrong", token }]) {
    await assert.rejects(queryAnalytics("SELECT 1", {
      ...config, fetchImpl: async () => assert.fail("unexpected network request"),
    }), /valid CLOUDFLARE_ACCOUNT_ID/);
  }
});

test("both reports weight sampling and explicitly request JSON; HTTP responses stay separate from outcomes", () => {
  const { usage, feedback } = buildAnalyticsQueries(30);
  assert.match(usage, /SUM\(_sample_interval\) AS calls/);
  for (const field of [1, 3, 4, 5, 6]) {
    assert.ok(usage.includes(`SUM(_sample_interval * double${field}) / SUM(_sample_interval)`));
  }
  assert.ok(usage.includes("SUM(if(double2 >= 200 AND double2 < 300, _sample_interval, 0)) AS transport_responses"));
  assert.match(usage, /blob3 AS outcome/);
  assert.match(feedback, /SUM\(_sample_interval\) AS responses/);
  for (const sql of [usage, feedback]) {
    assert.match(sql, /FORMAT JSON/);
    assert.doesNotMatch(sql, /COUNT\(\)|AVG\(/);
  }
});

test("the time window stays bounded and cannot become SQL syntax", () => {
  for (const [input, expected] of [[undefined, 7], ["bad", 7], ["0", 7], ["-2", 1], ["200", 90], ["30'; DROP TABLE x", 30]]) {
    const q = buildAnalyticsQueries(input);
    assert.equal(q.days, expected);
    assert.ok(q.usage.includes(`INTERVAL '${expected}' DAY`));
    assert.doesNotMatch(q.usage, /DROP/);
  }
});
