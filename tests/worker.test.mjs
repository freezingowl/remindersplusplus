import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createWorker } from "../worker/worker.mjs";

const TOKEN = "test-access-token-with-32-characters";
const START = Date.parse("2026-10-11T00:00:10Z");
const DUE = "2026-10-12T20:00:00+05:30";
const completion = (value = { title: "Call Mum", note: "", dueAt: DUE }) => ({
  status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ delay: null, ...value }) }] }],
});

// Execute the actual production SQL against SQLite, through D1's API shape.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async run() {
          const result = statement.run(Object.fromEntries(parameters.map((value, index) => [`?${index + 1}`, value])));
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        async first() { return statement.get(Object.fromEntries(parameters.map((value, index) => [`?${index + 1}`, value]))) ?? null; },
      };
    },
    close() { sqlite.close(); },
    row(route = "parse") { return sqlite.prepare("SELECT * FROM cue_quotas WHERE route = ?").get(route); },
  };
}

function fixture(t, { upstream, timeoutMs } = {}) {
  const db = database();
  t.after(() => db.close());
  let time = START;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return upstream ? upstream(url, options) : Response.json(completion());
  };
  const dependencies = { now: () => time, fetchImpl, timeoutMs };
  const env = { CUE_DB: db, OPENAI_API_KEY: "fake-upstream-key", CUE_CLIENT_TOKEN: TOKEN };
  return { db, env, calls, dependencies, worker: createWorker(dependencies), setTime(value) { time = value; } };
}

function request(body = { text: "Call Mum tomorrow at 8 PM", timeZone: "Asia/Kolkata" }, headers = {}) {
  return new Request("https://cue.example/v1/reminders/parse", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("Live Activity sync validates and rate limits without consuming AI quota or exposing credentials", async (t) => {
  const f = fixture(t);
  let synced = 0;
  Object.assign(f.env, { APNS_TEAM_ID: "ABCDEFGHIJ", APNS_KEY_ID: "KLMNOPQRST",
    APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----fake-test-only", APNS_BUNDLE_ID: "com.example.cue", APNS_ENVIRONMENT: "development",
    CUE_ACTIVITIES: { idFromName: (name) => name, get: () => ({ async fetch() { synced++; return Response.json({ ok: true, scheduled: true }); } }) } });
  const input = { sessionID: "12345678-1234-1234-1234-123456789abc", ownerSecret: "a".repeat(64), revision: 1,
    pushToken: "b".repeat(64), environment: "development", expiresAt: START + 3_600_000,
    reminders: [{ id: "first", title: "First", dueAt: START + 120_000, createdAt: START }] };
  const sync = (body = input, accessToken = TOKEN) => f.worker.fetch(new Request("https://cue.example/v1/live-activity", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), f.env);
  assert.equal((await sync(input, "incorrect")).status, 401);
  assert.equal((await sync({ ...input, reminders: Array(129).fill(input.reminders[0]) })).status, 400);
  assert.equal((await sync({ ...input, pushToken: "https://untrusted.example" })).status, 400);
  const results = await Promise.all(Array.from({ length: 61 }, () => sync()));
  assert.equal(results.filter((result) => result.status === 200).length, 60);
  assert.equal(results.filter((result) => result.status === 429).length, 1);
  assert.equal(synced, 60);
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.row(), undefined);
  assert.equal(f.db.row("transcribe"), undefined);
});

test("APNs transport check uses deliberately invalid credentials and never the participant's Apple/OpenAI key", async (t) => {
  const f = fixture(t, { upstream: async (url, options) => {
    assert.equal(url, `https://api.sandbox.push.apple.com/3/device/${"0".repeat(64)}`);
    assert.equal(options.headers.authorization, "bearer invalid-transport-test");
    assert.equal(options.redirect, "manual");
    return Response.json({ reason: "InvalidProviderToken", privateDiagnostic: "do not return" }, { status: 403 });
  } });
  const result = await f.worker.fetch(new Request("https://cue.example/v1/push-transport", { headers: { Authorization: `Bearer ${TOKEN}` } }), f.env);
  assert.deepEqual(await result.json(), { reachable: true, status: 403, reason: "InvalidProviderToken" });
  assert.equal(f.db.row(), undefined);
});

async function code(response) { return (await response.json()).error?.code; }

test("extracts with Luna, no reasoning, strict output and server time; keeps key on upstream only", async (t) => {
  const f = fixture(t);
  const result = await f.worker.fetch(request(), f.env);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).reminder, { title: "Call Mum", note: "", dueAt: DUE });
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(f.calls.length, 1);
  const { url, options } = f.calls[0];
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(options.headers.Authorization, "Bearer fake-upstream-key");
  assert.equal(options.redirect, "manual");
  const body = JSON.parse(options.body);
  assert.equal(body.model, "gpt-6-luna");
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.max_output_tokens, 512);
  assert.match(body.input[0].content, /2026-10-11T00:00:10.000Z/);
  assert.match(body.input[0].content, /Asia\/Kolkata/);
  assert.match(body.input[0].content, /05:30:10/); // Local clock supplied; no model UTC conversion needed.
  assert.equal(f.db.row().minute_count, 1);
});

test("relative durations use the submission clock across timezone and date boundaries", async (t) => {
  for (const [timeZone, submittedAt, delay, milliseconds] of [
    ["Asia/Kolkata", Date.parse("2026-10-10T23:25:21Z"), { amount: 2, unit: "minutes" }, 120_000],
    ["UTC", Date.parse("2026-12-31T23:59:30Z"), { amount: 90, unit: "seconds" }, 90_000],
    ["America/New_York", Date.parse("2026-11-01T05:59:30Z"), { amount: 1.5, unit: "hours" }, 5_400_000],
  ]) {
    const f = fixture(t, { upstream: async () => {
      f.setTime(submittedAt + 3000); // Network latency must not move the deadline.
      return Response.json(completion({ title: "Make sushi", note: "", dueAt: "", delay }));
    } });
    f.setTime(submittedAt);
    const response = await f.worker.fetch(request({ text: "Make sushi in 2 minutes", timeZone }), f.env);
    assert.equal(response.status, 200);
    assert.equal(Date.parse((await response.json()).reminder.dueAt), submittedAt + milliseconds);
  }
});

test("successful capture returns actual OpenAI usage metadata without raw headers or credentials", async (t) => {
  const output = { ...completion(), id: "resp_test", model: "gpt-6-luna", usage: {
    input_tokens: 500, input_tokens_details: { cached_tokens: 100 }, output_tokens: 50, total_tokens: 550,
  }, privateDiagnostic: "must-not-relay" };
  const f = fixture(t, { upstream: async () => Response.json(output, { headers: {
    "x-request-id": "req_test", "openai-organization": "org-test", "private-header": "must-not-relay",
  } }) });
  const response = await f.worker.fetch(request(), f.env);
  const payload = await response.json();
  assert.deepEqual(payload.ai, { provider: "openai", model: "gpt-6-luna", requestId: "req_test", responseId: "resp_test",
    organizationId: "org-test", inputTokens: 500, cachedInputTokens: 100, outputTokens: 50, totalTokens: 550 });
  assert.doesNotMatch(JSON.stringify(payload), /fake-upstream-key|must-not-relay/);
  const absent = fixture(t);
  const receipt = (await (await absent.worker.fetch(request(), absent.env)).json()).ai;
  assert.equal(receipt.inputTokens, null); // Missing usage is unavailable, never fabricated zero.
  assert.equal(receipt.requestId, null);
});

test("relative time rejects conflicting, malformed, excessive and already-expired durations", async (t) => {
  for (const delay of [undefined, {}, { amount: "2", unit: "minutes" }, { amount: 0, unit: "minutes" },
    { amount: -1, unit: "hours" }, { amount: 400 * 24, unit: "hours" }, { amount: 2, unit: "days" },
    { amount: 2, unit: "toString" }]) {
    const f = fixture(t, { upstream: async () => Response.json(completion({ title: "Task", note: "", dueAt: "", delay })) });
    assert.equal(await code(await f.worker.fetch(request(), f.env)), "invalid_time");
  }
  const conflict = fixture(t, { upstream: async () => Response.json(completion({ title: "Task", note: "", dueAt: DUE, delay: { amount: 2, unit: "minutes" } })) });
  assert.equal(await code(await conflict.worker.fetch(request(), conflict.env)), "invalid_time");
  const expired = fixture(t, { upstream: async () => {
    expired.setTime(START + 3000);
    return Response.json(completion({ title: "Task", note: "", dueAt: "", delay: { amount: 1, unit: "seconds" } }));
  } });
  assert.equal(await code(await expired.worker.fetch(request(), expired.env)), "past_time");
});

test("rejects unauthorized requests, browser origins, malformed input and missing configuration before paid calls", async (t) => {
  const f = fixture(t);
  assert.equal((await f.worker.fetch(request({}, { Authorization: "Bearer wrong" }), f.env)).status, 401);
  assert.equal((await f.worker.fetch(request({}, { Origin: "https://untrusted.example" }), f.env)).status, 403);
  for (const body of [null, {}, { text: " ", timeZone: "UTC" }, { text: "x".repeat(2001), timeZone: "UTC" }, { text: "Task", timeZone: "invalid/zone" }]) {
    assert.equal((await f.worker.fetch(request(body), f.env)).status, 400);
  }
  assert.equal((await f.worker.fetch(request(), { ...f.env, OPENAI_API_KEY: "" })).status, 503);
  assert.equal((await f.worker.fetch(request(), { ...f.env, CUE_CLIENT_TOKEN: "short" })).status, 503);
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.row(), undefined);
});

test("upstream redirects are rejected without forwarding credentials or retrying", async (t) => {
  const f = fixture(t, { upstream: async () => new Response(null, { status: 307, headers: { Location: "https://untrusted.example" } }) });
  assert.equal(await code(await f.worker.fetch(request(), f.env)), "ai_unavailable");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.redirect, "manual");
  assert.equal(f.calls[0].url, "https://api.openai.com/v1/responses");
});

test("enforces actual streamed bytes without trusting Content-Length", async (t) => {
  const f = fixture(t);
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(10_000));
    controller.enqueue(new Uint8Array(10_000));
    controller.close();
  } });
  const streamed = new Request("https://cue.example/v1/reminders/parse", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body, duplex: "half",
  });
  assert.equal((await f.worker.fetch(streamed, f.env)).status, 413);
  const malformed = request();
  const invalid = new Request(malformed.url, { method: "POST", headers: malformed.headers, body: "{invalid" });
  assert.equal(await code(await f.worker.fetch(invalid, f.env)), "invalid_json");
  assert.equal(f.calls.length, 0);
});

test("atomic quota admits only ten concurrent requests across fresh Worker instances", async (t) => {
  const f = fixture(t);
  const responses = await Promise.all(Array.from({ length: 30 }, () => createWorker(f.dependencies).fetch(request(), f.env)));
  assert.equal(responses.filter((item) => item.status === 200).length, 10);
  assert.equal(responses.filter((item) => item.status === 429).length, 20);
  assert.equal(f.calls.length, 10);
  assert.equal(f.db.row().minute_count, 10);
  assert.equal(f.db.row().day_count, 10); // Rejected requests do not consume daily capacity.
  assert.equal(responses.find((item) => item.status === 429).headers.get("Retry-After"), "50");
  f.setTime(START + 60_000);
  assert.equal((await f.worker.fetch(request(), f.env)).status, 200);
  assert.equal(f.db.row().minute_count, 1);
  assert.equal(f.db.row().day_count, 11);
  // A request started before the boundary but arriving late cannot roll counters back.
  f.setTime(START);
  assert.equal((await f.worker.fetch(request(), f.env)).status, 429);
  assert.equal(f.db.row().minute_count, 1);
  assert.equal(f.db.row().day_count, 11);
});

test("daily cap survives minute changes; only the UTC day reset admits another call", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 500; i++) {
    f.setTime(START + i * 60_000);
    assert.equal((await f.worker.fetch(request(), f.env)).status, 200);
  }
  f.setTime(START + 500 * 60_000);
  const blocked = await createWorker(f.dependencies).fetch(request(), f.env);
  assert.equal(blocked.status, 429);
  assert.equal(await code(blocked), "daily_limit");
  assert.equal(Number(blocked.headers.get("Retry-After")), 56_390);
  assert.equal(f.calls.length, 500);
  assert.equal(f.db.row().day_count, 500);
  f.setTime(START + 86_400_000);
  assert.equal((await f.worker.fetch(request(), f.env)).status, 200);
  assert.equal(f.db.row().day_count, 1);
});

test("quota failures fail closed, including unexpected D1 metadata", async (t) => {
  const f = fixture(t);
  for (const db of [
    { prepare() { throw new Error("private database details"); } },
    { prepare() { return { bind() { return this; }, async run() { return { success: true }; } }; } },
  ]) {
    const response = await f.worker.fetch(request(), { ...f.env, CUE_DB: db });
    assert.equal(response.status, 503);
    assert.equal(await code(response), "quota_unavailable");
  }
  assert.equal(f.calls.length, 0);
});

test("rejects refused, incomplete, malformed, impossible and past model outputs", async (t) => {
  const cases = [
    [{ status: "incomplete", output: [] }, 502],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }, 422],
    [completion({ title: "", note: "", dueAt: "" }), 502],
    [completion({ title: "Task", note: "", dueAt: "2026-10-12T20:00:00" }), 502],
    [completion({ title: "Task", note: "", dueAt: "2027-02-30T20:00:00Z" }), 502],
    [completion({ title: "Task", note: "", dueAt: "2026-10-10T20:00:00Z" }), 422],
  ];
  for (const [output, status] of cases) {
    const f = fixture(t, { upstream: async () => Response.json(output) });
    assert.equal((await f.worker.fetch(request(), f.env)).status, status);
    assert.equal(f.calls.length, 1); // No automatic paid retries.
  }
  const f = fixture(t, { upstream: async () => Response.json(completion({ title: "Task", note: "", dueAt: "" })) });
  assert.equal((await f.worker.fetch(request(), f.env)).status, 200); // Ambiguous time stays unset.
});

test("sanitizes upstream errors and timeout; never returns provider credentials or diagnostics", async (t) => {
  for (const [upstreamStatus, expected] of [[401, 503], [403, 503], [404, 503], [429, 503], [500, 502]]) {
    const f = fixture(t, { upstream: async () => Response.json({ error: { message: "fake-upstream-key private diagnostics" } }, { status: upstreamStatus }) });
    const response = await f.worker.fetch(request(), f.env);
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /fake-upstream-key|diagnostics/);
    assert.equal(f.db.row().day_count, 1); // Failed upstream attempts still count.
  }
  const f = fixture(t, { timeoutMs: 5, upstream: async (_, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  assert.equal((await f.worker.fetch(request(), f.env)).status, 504);
});

function audioRequest(extraModel) {
  const form = new FormData();
  form.append("file", new File(["test audio fixture"], "capture.m4a", { type: "audio/m4a" }));
  if (extraModel) form.append("model", extraModel);
  return new Request("https://cue.example/v1/audio/transcribe", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form,
  });
}

test("voice uses its own bounded quota and server-selected transcription model", async (t) => {
  const f = fixture(t, { upstream: async () => Response.json({ text: "Call Mum tomorrow at 8 PM" }) });
  for (let i = 0; i < 2; i++) {
    const response = await f.worker.fetch(audioRequest("expensive-client-model"), f.env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).text, "Call Mum tomorrow at 8 PM");
  }
  assert.equal((await f.worker.fetch(audioRequest(), f.env)).status, 429);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(f.calls[0].options.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(f.calls[0].options.body.get("response_format"), "json");
  assert.equal(f.db.row("transcribe").day_count, 2);
  assert.equal(f.db.row(), undefined);
  const form = new FormData();
  form.append("file", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "capture.m4a", { type: "audio/m4a" }));
  const invalid = new Request("https://cue.example/v1/audio/transcribe", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form,
  });
  assert.equal((await f.worker.fetch(invalid, f.env)).status, 400);
  assert.equal(f.calls.length, 2);
});

test("health makes no AI call; CORS permits only the configured origin; routes/methods are restricted", async (t) => {
  const f = fixture(t);
  const response = await f.worker.fetch(new Request("https://cue.example/health"), f.env);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.calls.length, 0);
  const browserEnv = { ...f.env, ALLOWED_ORIGIN: "https://cue-web.example" };
  const preflight = new Request("https://cue.example/v1/reminders/parse", { method: "OPTIONS", headers: { Origin: browserEnv.ALLOWED_ORIGIN } });
  assert.equal((await f.worker.fetch(preflight, browserEnv)).status, 204);
  const allowed = await f.worker.fetch(request(undefined, { Origin: browserEnv.ALLOWED_ORIGIN }), browserEnv);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), browserEnv.ALLOWED_ORIGIN);
  assert.equal((await f.worker.fetch(new Request("https://cue.example/unknown"), f.env)).status, 404);
  const get = await f.worker.fetch(new Request("https://cue.example/v1/reminders/parse"), f.env);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("Allow"), "POST");
});

test("connection diagnostics name missing settings and verify token/schema without paid calls or quota", async (t) => {
  const f = fixture(t);
  const health = await f.worker.fetch(new Request("https://cue.example/health"), {});
  assert.equal(health.status, 503);
  assert.deepEqual((await health.json()).missing, ["CUE_DB", "OPENAI_API_KEY", "CUE_CLIENT_TOKEN"]);
  const statusRequest = () => new Request("https://cue.example/v1/status", { headers: { Authorization: `Bearer ${TOKEN}` } });
  const ready = await f.worker.fetch(statusRequest(), f.env);
  const diagnostics = await ready.json();
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.model, "gpt-6-luna");
  assert.equal(diagnostics.liveActivity.configured, false);
  assert.ok(diagnostics.liveActivity.missing.includes("APNS_PRIVATE_KEY"));
  assert.equal((await f.worker.fetch(new Request("https://cue.example/v1/status"), f.env)).status, 401);
  const badSchema = { prepare() { return { async first() { throw new Error("private schema details"); } }; } };
  assert.equal(await code(await f.worker.fetch(statusRequest(), { ...f.env, CUE_DB: badSchema })), "quota_unavailable");
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.row(), undefined);
});

test("sushi preflight makes no paid request when readiness fails and validates the relative deadline on success", async () => {
  const { checkCloud } = await import("../scripts/checkCloud.cjs");
  const calls = [];
  await assert.rejects(checkCloud({ origin: "https://cue.example", token: TOKEN, parse: true, fetchImpl: async (url) => {
    calls.push(url);
    return Response.json({ error: { message: "Missing CUE_DB" } }, { status: 503 });
  } }), /Missing CUE_DB/);
  assert.equal(calls.length, 1);
  const result = await checkCloud({ origin: "https://cue.example", token: TOKEN, parse: true, fetchImpl: async (url, options) => {
    if (url.endsWith("/v1/status")) return Response.json({ ok: true });
    assert.equal(JSON.parse(options.body).text, "Remind me to make sushi in 2 minutes");
    return Response.json({ reminder: { title: "Make sushi", dueAt: new Date(Date.now() + 120_000).toISOString() }, ai: { inputTokens: 500, outputTokens: 50 } });
  } });
  assert.equal(result.title, "Make sushi");
  assert.deepEqual(result.ai, { inputTokens: 500, outputTokens: 50 });
});
