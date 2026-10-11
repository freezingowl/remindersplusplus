const path = require("node:path");
const assert = require("node:assert/strict");
const { checkCloud } = require("./checkCloud.cjs");

// Synthetic requests only. This checks AI interpretation; it never reads or
// writes anyone's real Calendar, or creates reminders on a phone.
async function checkAssistant({ origin, token, fetchImpl = fetch }) {
  const status = await checkCloud({ origin, token, fetchImpl });
  if (!status.assistant || !status.assistantDefaults) throw new Error("Deploy the current Worker with scheduling defaults before running paid routing checks.");
  const timeZone = "Asia/Kolkata";
  const localParts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const reports = [];
  const futureParts = localParts(Date.now());
  const afterTomorrow = new Date(Date.UTC(+futureParts.year, +futureParts.month - 1, +futureParts.day + 2));
  const expectedDay = afterTomorrow.toISOString().slice(0, 10);
  function checkBareSix(value, started) {
    const local = localParts(started);
    const day = new Date(Date.UTC(+local.year, +local.month - 1, +local.day + (+local.hour >= 18 ? 1 : 0))).toISOString().slice(0, 10);
    const actual = localParts(Date.parse(value));
    assert.equal(`${actual.year}-${actual.month}-${actual.day}`, day, "Use today or tomorrow for the next 6 PM");
    assert.equal(actual.hour, "18", "Bare 6 means 6 PM");
    assert.equal(actual.minute, "00");
  }
  const tests = [
    { text: "Remind me to make sushi in two minutes", action: "reminder", check(plan, started) {
      assert.ok(Math.abs(Date.parse(plan.dueAt) - started - 120_000) < 5000, "Reminder must be two minutes from submission");
    } },
    { text: "What events are coming up day after tomorrow?", action: "query_calendar", check(plan) {
      assert.equal(plan.queryKind, "agenda");
      assert.ok(plan.rangeStart.startsWith(expectedDay));
      assert.equal(localParts(Date.parse(plan.rangeStart)).hour, "00");
    } },
    { text: "When am I free two days from now?", action: "query_calendar", check(plan) {
      assert.equal(plan.queryKind, "availability");
      assert.ok(plan.rangeStart.startsWith(expectedDay));
      assert.equal(localParts(Date.parse(plan.rangeStart)).hour, "09");
      assert.equal(localParts(Date.parse(plan.rangeEnd)).hour, "18");
    } },
    { text: "Add a calendar event called Cue calendar test tomorrow at 2 PM for 30 minutes", action: "create_event", check(plan) {
      assert.equal(localParts(Date.parse(plan.startAt)).hour, "14");
      assert.equal(Date.parse(plan.endAt) - Date.parse(plan.startAt), 30 * 60_000);
    } },
    { text: "Move my Cue calendar test event tomorrow to 4 PM tomorrow", action: "update_event", check(plan) {
      assert.equal(localParts(Date.parse(plan.startAt)).hour, "16");
      assert.match(plan.searchTitle, /Cue calendar test/i);
    } },
    { text: "Schedule a meeting", action: "create_event", check(plan, started) {
      assert.equal(localParts(Date.parse(plan.startAt)).minute, "00");
      assert.ok(Date.parse(plan.startAt) > started && Date.parse(plan.startAt) - started <= 3_600_000, "Use the next whole local hour");
      assert.ok(!plan.endAt || Date.parse(plan.endAt) - Date.parse(plan.startAt) === 3_600_000);
    } },
    { text: "Meeting at 6", action: "create_event", check(plan, started) { checkBareSix(plan.startAt, started); } },
    { text: "Remind me about a meeting at 6", action: "reminder", check(plan, started) { checkBareSix(plan.dueAt, started); } },
  ];
  for (const sample of tests) {
    const started = Date.now();
    const response = await fetchImpl(`${origin.replace(/\/+$/, "")}/v1/assistant`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: sample.text, timeZone }), signal: AbortSignal.timeout(25_000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? `Assistant check failed (HTTP ${response.status})`);
    assert.equal(payload?.plan?.action, sample.action, sample.text);
    sample.check(payload.plan, started);
    const report = { action: payload.plan.action, elapsedMs: Date.now() - started, reasoningTokens: payload.ai?.reasoningTokens ?? null, passed: true };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  return reports;
}

if (require.main === module) {
  require("@expo/env").load(path.dirname(require.resolve("../package.json")), { silent: true });
  checkAssistant({ origin: process.env.EXPO_PUBLIC_CUE_WORKER_URL?.trim() ?? "", token: process.env.EXPO_PUBLIC_CUE_CLIENT_TOKEN?.trim() ?? "" })
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { checkAssistant };
