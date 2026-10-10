import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
