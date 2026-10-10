export const cloudConfig = {
  url: process.env.EXPO_PUBLIC_CUE_WORKER_URL?.trim().replace(/\/+$/, "") ?? "",
  token: process.env.EXPO_PUBLIC_CUE_CLIENT_TOKEN?.trim() ?? "",
};

export function cloudConfigurationError(): string | undefined {
  try {
    const url = new URL(cloudConfig.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(cloudConfig.token)) throw new Error();
    return undefined;
  } catch {
    return "Cloud AI isn’t configured in this build. Check the Worker URL and Cue access token, then rebuild/install Cue.";
  }
}

export let cloudConfigured = !cloudConfigurationError();

export function applyNativeCloudConfiguration(config: { url: string; token: string }): void {
  cloudConfig.url = config.url;
  cloudConfig.token = config.token;
  cloudConfigured = !cloudConfigurationError();
}

export async function checkCloudConnection(): Promise<void> {
  const configError = cloudConfigurationError();
  if (configError) throw new Error(configError);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${cloudConfig.url}/v1/status`, {
      headers: { Authorization: `Bearer ${cloudConfig.token}` }, signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 404) throw new Error("Update the Cloudflare Worker with worker/worker.mjs to enable its connection check.");
    if (!response.ok || payload?.ok !== true) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Cloudflare setup is incomplete. Check CUE_DB, OPENAI_API_KEY and the matching CUE_CLIENT_TOKEN.");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The Worker didn’t respond. Check your connection and try again.");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function cloudRequest(path: string, body: string | FormData): Promise<unknown> {
  const configError = cloudConfigurationError();
  if (configError) throw new Error(configError);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${cloudConfig.url}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cloudConfig.token}`,
        ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      let message = typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 300) : "Cloud AI is unavailable. Please try again.";
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (response.status === 429 && retryAfter > 0 && retryAfter <= 60) message += ` Try again in ${Math.ceil(retryAfter)} seconds.`;
      throw new Error(message);
    }
    if (!payload) throw new Error("Cloud AI returned an unreadable response.");
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Cloud AI took too long. Please try again.");
    throw error;
  } finally { clearTimeout(timer); }
}
