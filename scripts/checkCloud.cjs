const path = require("node:path");

async function checkCloud({ origin, token, parse = false, pushTransport = false, fetchImpl = fetch }) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !/^[A-Za-z0-9_-]{32,256}$/.test(token ?? "")) throw new Error("Configure Cue’s Worker URL and access token in .env first.");
  const base = origin.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}` };
  async function request(route, options = {}) {
    const response = await fetchImpl(`${base}${route}`, { headers, signal: AbortSignal.timeout(25_000), ...options });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) {
        const health = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(15_000) });
        const state = await health.json().catch(() => null);
        throw new Error(state?.ok === false
          ? "Worker setup is incomplete. Check CUE_DB, OPENAI_API_KEY and CUE_CLIENT_TOKEN; then deploy the current worker/worker.mjs for detailed checks."
          : "Deploy the current worker/worker.mjs to enable its authenticated connection check.");
      }
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 400) : `Worker check failed (HTTP ${response.status}).`);
    }
    return payload;
  }
  const status = await request("/v1/status");
  if (status?.ok !== true) throw new Error("Worker returned an invalid connection status.");
  if (pushTransport) return { connected: true, liveActivity: status.liveActivity ?? null, pushTransport: await request("/v1/push-transport") };
  if (!parse) return { connected: true, assistant: status.assistant === true, liveActivity: status.liveActivity ?? null };
  const start = Date.now();
  const result = await request("/v1/reminders/parse", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Remind me to make sushi in 2 minutes", timeZone: "Asia/Kolkata" }),
  });
  const reminder = result?.reminder;
  const seconds = (Date.parse(reminder?.dueAt) - start) / 1000;
  if (typeof reminder?.title !== "string" || !Number.isFinite(seconds) || seconds < 90 || seconds > 150) {
    throw new Error("The sushi test did not return a time about two minutes ahead. Check the model output before testing the phone.");
  }
  return { connected: true, title: reminder.title, dueAt: reminder.dueAt, elapsedMs: Date.now() - start, ai: result.ai ?? null };
}

if (require.main === module) {
  const root = path.dirname(require.resolve("../package.json"));
  require("@expo/env").load(root, { silent: true });
  checkCloud({ origin: process.env.EXPO_PUBLIC_CUE_WORKER_URL?.trim() ?? "", token: process.env.EXPO_PUBLIC_CUE_CLIENT_TOKEN?.trim() ?? "", parse: process.argv.includes("--parse"), pushTransport: process.argv.includes("--push-transport") })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { checkCloud };
