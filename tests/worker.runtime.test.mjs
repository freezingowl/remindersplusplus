import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Exercise the real Workers request implementation; injected Node fetch mocks
// alone cannot catch unsupported runtime options such as redirect:"error".
test("Workers runtime parses the sushi prompt and refuses upstream redirects", { timeout: 30_000 }, async () => {
  const token = "fake-test-token-at-least-32-characters";
  let redirect = false;
  let calls = 0;
  const options = {
    host: "127.0.0.1", port: 0, cf: false, logRequests: false,
    modules: true, script: readFileSync(new URL("../worker/worker.mjs", import.meta.url), "utf8"),
    compatibilityDate: "2026-10-10",
    d1Databases: { CUE_DB: "offline-cue-runtime" },
    bindings: { OPENAI_API_KEY: "fake-upstream-key", CUE_CLIENT_TOKEN: token },
    outboundService: async (request) => {
      calls += 1;
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      assert.equal(request.headers.get("Authorization"), "Bearer fake-upstream-key");
      if (redirect) return new Response(null, { status: 307, headers: { Location: "https://untrusted.example" } });
      assert.equal((await request.json()).input[1].content, "Remind me to make sushi in 2 minutes");
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        title: "Make sushi", note: "", dueAt: "", delay: { amount: 2, unit: "minutes" },
      }) }] }] });
    },
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  try {
    const db = await mf.getD1Database("CUE_DB");
    const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");
    await db.exec(schema.replace(/--[^\n]*/g, "").replace(/\n/g, " "));
    const capture = () => mf.dispatchFetch("https://cue.example/v1/reminders/parse", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Remind me to make sushi in 2 minutes", timeZone: "Asia/Kolkata" }),
    });
    const response = await capture();
    assert.equal(response.status, 200);
    const { reminder } = await response.json();
    assert.equal(reminder.title, "Make sushi");
    assert.ok(Math.abs(Date.parse(reminder.dueAt) - Date.now() - 120_000) < 5_000);
    assert.equal(calls, 1);
    redirect = true;
    const rejected = await capture();
    assert.equal(rejected.status, 502);
    assert.equal((await rejected.json()).error.code, "ai_unavailable");
    assert.equal(calls, 2);
    assert.equal((await db.prepare("SELECT day_count FROM cue_quotas WHERE route = 'parse'").first()).day_count, 2);
  } finally { await mf.dispose(); }
});

test("Workers assistant uses low reasoning and suppresses follow-ups without bypassing validation", { timeout: 30_000 }, async () => {
  const token = "fake-test-token-at-least-32-characters";
  let calls = 0;
  const startAt = new Date(Date.now() + 86_400_000).toISOString();
  const plan = { action: "create_event", title: "Meeting", note: "", dueAt: "", delay: null,
    startAt, endAt: "", allDay: false, searchTitle: "", rangeStart: "", rangeEnd: "", queryKind: "agenda", reply: "" };
  const mf = new Miniflare(convertV4MiniflareOptions({
    host: "127.0.0.1", port: 0, cf: false, logRequests: false, modules: true,
    script: readFileSync(new URL("../worker/worker.mjs", import.meta.url), "utf8"), compatibilityDate: "2026-10-10",
    d1Databases: { CUE_DB: "offline-cue-defaults-runtime" },
    bindings: { OPENAI_API_KEY: "fake-upstream-key", CUE_CLIENT_TOKEN: token },
    outboundService: async (request) => {
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      const body = await request.json();
      assert.equal(body.reasoning.effort, "low");
      assert.equal(body.max_output_tokens, 2048);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.input[1].content, "Meeting at 6");
      assert.match(body.input[0].content, /Never ask the user a follow-up/);
      calls++;
      const result = calls === 1 ? { ...plan, action: "answer", title: "", startAt: "", reply: "What date is the meeting?" } : plan;
      return Response.json({ status: "completed", usage: { output_tokens_details: { reasoning_tokens: 32 } },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
    },
  }));
  try {
    const db = await mf.getD1Database("CUE_DB");
    await db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
    const capture = () => mf.dispatchFetch("https://cue.example/v1/assistant", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Meeting at 6", timeZone: "Asia/Kolkata" }),
    });
    const suppressed = await capture();
    assert.equal(suppressed.status, 200);
    assert.equal((await suppressed.json()).plan.reply, "I couldn’t complete that request. Nothing was changed.");
    const action = await capture();
    assert.equal(action.status, 200);
    const result = await action.json();
    assert.equal(result.plan.startAt, startAt);
    assert.equal(result.plan.action, "create_event");
    assert.equal(result.ai.reasoningTokens, 32);
    assert.equal((await db.prepare("SELECT day_count FROM cue_quotas WHERE route = 'parse'").first()).day_count, 2);
  } finally { await mf.dispose(); }
});

test("real Workers alarms send successive silent Live Activity updates and enforce ownership", { timeout: 30_000 }, async () => {
  const token = "fake-test-token-at-least-32-characters";
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" });
  const updates = [];
  let finish;
  let failure;
  const completed = new Promise((resolve, reject) => { finish = resolve; failure = reject; });
  const timeout = setTimeout(() => failure(new Error("Scheduled updates did not arrive in the Workers runtime")), 10_000);
  const options = {
    host: "127.0.0.1", port: 0, cf: false, logRequests: false, modules: true,
    script: readFileSync(new URL("../worker/worker.mjs", import.meta.url), "utf8"), compatibilityDate: "2026-10-10",
    d1Databases: { CUE_DB: "offline-cue-activity-runtime" },
    durableObjects: { CUE_ACTIVITIES: { className: "CueActivityScheduler", useSQLite: true } },
    bindings: { OPENAI_API_KEY: "fake-upstream-key", CUE_CLIENT_TOKEN: token,
      APNS_TEAM_ID: "ABCDEFGHIJ", APNS_KEY_ID: "KLMNOPQRST", APNS_PRIVATE_KEY: key,
      APNS_BUNDLE_ID: "com.example.cue", APNS_ENVIRONMENT: "development" },
    outboundService: async (request) => {
      try {
        assert.equal(request.url, `https://api.sandbox.push.apple.com/3/device/${"b".repeat(64)}`);
        assert.equal(request.headers.get("apns-push-type"), "liveactivity");
        const payload = await request.json();
        assert.equal(Object.hasOwn(payload.aps, "alert"), false);
        updates.push(payload.aps["content-state"]);
        if (updates.length === 2) finish();
        return new Response(null, { status: 200 });
      } catch (error) { failure(error); return new Response(null, { status: 500 }); }
    },
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  try {
    const db = await mf.getD1Database("CUE_DB");
    await db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
    const now = Date.now();
    const input = { sessionID: "12345678-1234-1234-1234-123456789abc", ownerSecret: "a".repeat(64), revision: 1,
      pushToken: "b".repeat(64), environment: "development", expiresAt: now + 3_600_000,
      reminders: [{ id: "first", title: "First", dueAt: now + 500, createdAt: now },
        { id: "second", title: "Second", dueAt: now + 1800, createdAt: now + 1 }] };
    const sync = (body, accessToken = token) => mf.dispatchFetch("https://cue.example/v1/live-activity", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await sync(input, "incorrect")).status, 401);
    assert.equal((await sync({ ...input, reminders: Array(129).fill(input.reminders[0]) })).status, 400);
    assert.equal((await sync(input)).status, 200);
    assert.equal((await sync({ ...input, revision: 2, ownerSecret: "c".repeat(64) })).status, 403);
    await completed;
    assert.deepEqual(updates.map((item) => item.reminderID), ["first", "second"]);
    assert.equal(updates[1].missedCount, 1);
    assert.equal((await db.prepare("SELECT day_count FROM cue_activity_quotas WHERE route='activity'").first()).day_count, 2);
    assert.equal(await db.prepare("SELECT route FROM cue_quotas LIMIT 1").first(), null);
    assert.equal((await sync({ ...input, revision: 3, stop: true })).status, 200);
  } finally { clearTimeout(timeout); await mf.dispose(); }
});
