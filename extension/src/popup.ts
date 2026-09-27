import type { RunState } from "./config";
import { send } from "./send";

interface StatusResult {
  settings: { appUrl: string; token: string; autoVerify: boolean; dailyCap: number };
  run: RunState;
  server: {
    workspace?: string;
    verifiedToday?: number;
    pending?: number;
    dailyCap?: number;
    pauseUntil?: string | null;
    error?: string;
  } | null;
}

const root = document.getElementById("root")!;

function h(tag: string, attrs: Record<string, string> = {}, text?: string) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

async function draw() {
  const s = await send<StatusResult>({ type: "status" });
  root.replaceChildren();
  root.className = "";

  if (!s.settings.token) {
    const card = h("div", { class: "card" });
    card.append(
      h("p", {}, "Not connected yet."),
      h("p", { class: "muted" }, "In Hunter → Settings, create an extension token and paste it in Options."),
    );
    const b = h("button", {}, "Open options");
    b.addEventListener("click", () => chrome.runtime.openOptionsPage());
    card.append(b);
    root.append(card);
    return;
  }

  const paused = s.run.pausedUntil && new Date(s.run.pausedUntil) > new Date();
  const conn = h("div", { class: "card" });
  conn.append(
    h(
      "div",
      { class: s.server?.error ? "bad" : "ok" },
      s.server?.error ? `App error: ${s.server.error}` : `Connected · ${s.server?.workspace ?? ""}`,
    ),
  );
  const stats = h("div", { class: "grid", style: "margin-top:8px" });
  const cell = (label: string, value: string) => {
    const c = h("div");
    c.append(h("div", { class: "stat" }, value), h("div", { class: "muted" }, label));
    return c;
  };
  stats.append(
    cell("verified today", String(s.server?.verifiedToday ?? s.run.verified)),
    cell("waiting in queue", String(s.server?.pending ?? "—")),
  );
  conn.append(stats);
  root.append(conn);

  const state = h("div", { class: "card" });
  if (paused) {
    state.append(
      h(
        "p",
        { class: "bad" },
        `Paused until ${new Date(s.run.pausedUntil!).toLocaleTimeString()}: ${s.run.pauseReason === "login_required" ? "eBay asked you to sign in" : "eBay showed a bot check"}.`,
      ),
      h("p", { class: "muted" }, "Open ebay.com, sign in or complete the check, then resume."),
    );
    const resume = h("button", {}, "Resume");
    resume.addEventListener("click", async () => {
      resume.setAttribute("disabled", "");
      await send({ type: "resume" });
      await draw();
    });
    state.append(resume);
  } else {
    state.append(
      h(
        "p",
        { class: "muted" },
        s.settings.autoVerify ? `Background checks on · ${s.run.checked}/${s.settings.dailyCap} today` : "Background checks off (Options)",
      ),
    );
    if (s.run.lastError) state.append(h("p", { class: "bad" }, s.run.lastError));
    const run = h("button", {}, "Check queue now");
    run.addEventListener("click", async () => {
      run.setAttribute("disabled", "");
      run.textContent = "Checking…";
      await send({ type: "runNow" });
      await draw();
    });
    state.append(run);
  }
  root.append(state);

  const open = h("a", { href: s.settings.appUrl, target: "_blank" }, "Open Hunter →");
  root.append(open);
}

document.getElementById("options")!.addEventListener("click", (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});
draw().catch((e: unknown) => {
  root.textContent = e instanceof Error ? e.message : String(e);
});
