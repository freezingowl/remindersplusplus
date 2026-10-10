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
    return "Cloud AI isn’t configured. Add the Worker URL and Cue access token to the app’s environment, then restart Cue.";
  }
}

export const cloudConfigured = !cloudConfigurationError();

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
