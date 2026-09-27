import { getSettings, saveSettings } from "./config";
import { send } from "./send";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $<HTMLSpanElement>("msg");

async function load() {
  const s = await getSettings();
  $<HTMLInputElement>("appUrl").value = s.appUrl;
  $<HTMLInputElement>("token").value = s.token;
  $<HTMLInputElement>("dailyCap").value = String(s.dailyCap);
  $<HTMLInputElement>("autoVerify").checked = s.autoVerify;
  $<HTMLInputElement>("bundleSkip").checked = s.bundleSkip;
}

/** The app origin needs a host permission; the build's default origin is granted at install time. */
async function ensureOriginPermission(appUrl: string): Promise<boolean> {
  const origin = `${new URL(appUrl).origin}/*`;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

$<HTMLFormElement>("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.className = "muted";
  try {
    const appUrl = $<HTMLInputElement>("appUrl").value.trim();
    if (!(await ensureOriginPermission(appUrl))) throw new Error("Permission to reach the app URL was not granted");
    await saveSettings({
      appUrl,
      token: $<HTMLInputElement>("token").value.trim(),
      dailyCap: Math.max(1, Math.min(2000, Number($<HTMLInputElement>("dailyCap").value) || 300)),
      autoVerify: $<HTMLInputElement>("autoVerify").checked,
      bundleSkip: $<HTMLInputElement>("bundleSkip").checked,
    });
    msg.textContent = "Saved";
    msg.className = "ok";
  } catch (error) {
    msg.textContent = error instanceof Error ? error.message : String(error);
    msg.className = "bad";
  }
});

$<HTMLButtonElement>("test").addEventListener("click", async () => {
  msg.textContent = "Testing…";
  msg.className = "muted";
  const status = await send<{ server: { workspace?: string; error?: string } | null }>({ type: "status" });
  if (status.server?.workspace) {
    msg.textContent = `Connected to “${status.server.workspace}”`;
    msg.className = "ok";
  } else {
    msg.textContent = status.server?.error ?? "Save a token first";
    msg.className = "bad";
  }
});

void load();
