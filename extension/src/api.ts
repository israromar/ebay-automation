import { getSettings } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Calls the Hunter web app with the extension token. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const settings = await getSettings();
  if (!settings.token) throw new ApiError("Not connected: paste your extension token in Options", 401);
  const res = await fetch(`${settings.appUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 404) throw new ApiError(json.error ?? `Hunter API ${res.status}`, res.status);
  return json;
}
