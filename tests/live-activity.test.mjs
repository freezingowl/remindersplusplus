import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { activityPayload, CueActivityScheduler } from "../worker/worker.mjs";

const START = Date.parse("2026-10-11T00:00:00Z");
const SESSION = "12345678-1234-1234-1234-123456789abc";
function schedule(overrides = {}) {
  return { sessionID: SESSION, ownerSecret: "a".repeat(64), revision: 1, pushToken: "b".repeat(64),
    environment: "development", expiresAt: START + 8 * 3_600_000, reviewingID: null, reviewAnchor: null,
    reminders: [{ id: "first", title: "First reminder", dueAt: START + 120_000, createdAt: START },
      { id: "second", title: "Second reminder", dueAt: START + 180_000, createdAt: START + 1000 }], ...overrides };
}
function context() {
  const data = new Map();
  let alarm = null;
  return { blockConcurrencyWhile: (work) => work(), storage: {
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async deleteAll() { data.clear(); alarm = null; },
    async setAlarm(time) { alarm = time; }, async getAlarm() { return alarm; },
  } };
}
function fakeApple() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { publicKey, env: { APNS_TEAM_ID: "ABCDEFGHIJ", APNS_KEY_ID: "KLMNOPQRST",
    APNS_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
    APNS_ENVIRONMENT: "development", APNS_BUNDLE_ID: "com.example.cue" } };
}
function sync(object, input) { return object.fetch(new Request("https://cue.internal/sync", { method: "POST", body: JSON.stringify(input) })); }

test("same activity advances at two and three minutes, then counts unfinished tasks as missed", () => {
  const input = schedule();
  const before = activityPayload(input, START).aps;
  assert.equal(before["content-state"].reminderID, "first");
  assert.equal(before["stale-date"], (START + 120_000) / 1000);
  const first = activityPayload(input, START + 120_000).aps;
  assert.equal(first["content-state"].phase, "due");
  assert.equal(first["content-state"].reminderID, "first");
  assert.equal(first["content-state"].missedCount, 0);
  const second = activityPayload(input, START + 180_000).aps;
  assert.equal(second["content-state"].reminderID, "second");
  assert.equal(second["content-state"].phase, "due");
  assert.equal(second["content-state"].missedCount, 1);
  assert.equal(activityPayload(input, START + 240_000).aps["content-state"].missedCount, 2);
  assert.equal(Object.hasOwn(second, "alert"), false);
  assert.equal(Object.hasOwn(second, "sound"), false);
  assert.equal(new TextEncoder().encode(JSON.stringify({ aps: second })).length < 4096, true);
  // Swift Date decoding uses seconds since 2001; APNs timestamps use Unix seconds.
  assert.equal(second["content-state"].dueAt, (START + 180_000 - 978307200000) / 1000);
});

test("missed review restores current priority when a newer deadline arrives; completion removes missed entries", () => {
  const input = schedule({ reviewingID: "first", reviewAnchor: "second" });
  assert.equal(activityPayload(input, START + 180_000).aps["content-state"].reminderID, "first");
  input.reminders.push({ id: "third", title: "Third", dueAt: START + 210_000, createdAt: START + 2000 });
  const third = activityPayload(input, START + 210_000).aps["content-state"];
  assert.equal(third.reminderID, "third");
  assert.equal(third.reviewingMissed, false);
  input.reminders = input.reminders.filter((item) => item.id !== "first");
  assert.equal(activityPayload(input, START + 210_000).aps["content-state"].missedCount, 1);
  assert.equal(activityPayload(schedule({ reminders: [] }), START).aps["content-state"].title, "Nothing waiting");
  input.reviewAnchor = null;
  const late = activityPayload(input, START + 300_000).aps["content-state"];
  assert.equal(late.reminderID, "second");
  assert.equal(late.reviewingMissed, true);
});

test("scheduler protects ownership, ignores stale syncs and prevents stopped schedules from returning", async () => {
  const ctx = context();
  const object = new CueActivityScheduler(ctx, fakeApple().env);
  assert.equal((await sync(object, schedule())).status, 200);
  assert.equal((await ctx.storage.get("schedule")).ownerSecret, undefined);
  assert.equal((await sync(object, schedule({ ownerSecret: "c".repeat(64), revision: 9 }))).status, 403);
  assert.equal((await sync(object, schedule({ revision: 2, reminders: [] }))).status, 200);
  assert.equal((await sync(object, schedule())).status, 200);
  assert.equal((await ctx.storage.get("schedule")).reminders.length, 0);
  await sync(object, schedule({ revision: 3, stop: true }));
  assert.equal((await ctx.storage.get("schedule")).pushToken, undefined);
  assert.equal((await sync(object, schedule({ revision: 4 }))).status, 409);
});

test("alarm signs a valid ES256 token, sends only the existing card, and schedules its successor", async (t) => {
  const oldFetch = globalThis.fetch;
  const oldNow = Date.now;
  let now = START + 120_000;
  Date.now = () => now;
  t.after(() => { globalThis.fetch = oldFetch; Date.now = oldNow; });
  const apple = fakeApple();
  const ctx = context();
  const object = new CueActivityScheduler(ctx, apple.env);
  await sync(object, schedule());
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const token = options.headers.authorization.slice(7);
    const [header, body, signature] = token.split(".");
    assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "ES256");
    assert.equal(JSON.parse(Buffer.from(body, "base64url")).iss, apple.env.APNS_TEAM_ID);
    assert.equal(verify("sha256", Buffer.from(`${header}.${body}`), { key: apple.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")), true);
    return new Response(null, { status: 200 });
  };
  await object.alarm();
  assert.equal(calls[0].url, `https://api.sandbox.push.apple.com/3/device/${"b".repeat(64)}`);
  assert.equal(calls[0].options.headers["apns-topic"], "com.example.cue.push-type.liveactivity");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(JSON.parse(calls[0].options.body).aps["content-state"].reminderID, "first");
  assert.equal(await ctx.storage.getAlarm(), START + 180_000);
  now += 60_000;
  await object.alarm();
  assert.equal(JSON.parse(calls[1].options.body).aps["content-state"].reminderID, "second");
  assert.equal(calls[0].options.headers.authorization, calls[1].options.headers.authorization);
  const restarted = new CueActivityScheduler(ctx, apple.env);
  await restarted.alarm();
  assert.equal(calls[0].options.headers.authorization, calls[2].options.headers.authorization);
  now = START + 8 * 3_600_000;
  await object.alarm();
  assert.equal(await ctx.storage.get("schedule"), undefined);
});

test("alarm bounds retries, never follows redirects and clears invalid token data", async (t) => {
  const oldFetch = globalThis.fetch;
  const oldNow = Date.now;
  let now = START + 180_000;
  Date.now = () => now;
  t.after(() => { globalThis.fetch = oldFetch; Date.now = oldNow; });
  const ctx = context();
  const object = new CueActivityScheduler(ctx, fakeApple().env);
  await sync(object, schedule());
  globalThis.fetch = async () => new Response(null, { status: 503 });
  for (let attempt = 1; attempt <= 7; attempt++) {
    await object.alarm();
    assert.equal((await ctx.storage.get("schedule")).failures, attempt);
    if (attempt <= 6) now = await ctx.storage.getAlarm();
  }
  assert.equal(await ctx.storage.getAlarm(), schedule().expiresAt);
  globalThis.fetch = async () => new Response(null, { status: 410 });
  await object.alarm();
  const stored = await ctx.storage.get("schedule");
  assert.equal(stored.stopped, true);
  assert.equal(stored.pushToken, undefined);
  assert.equal(stored.reminders, undefined);
});
