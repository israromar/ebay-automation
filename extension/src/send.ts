import type { Message } from "./config";

export async function send<T>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as { ok: boolean; result?: T; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "Extension background did not respond");
  return response.result as T;
}
