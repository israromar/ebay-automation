import { EBAY_ORIGIN, ebayItemIdFromUrl, getSettings, money } from "./config";
import { send } from "./send";

/**
 * eBay item page panel: shows what Hunter knows about this listing (exact 30-day sold count, best
 * AliExpress source) with "Verify now" and "Track" buttons. It makes no eBay requests of its own;
 * verification goes through the background worker's paced queue.
 */

interface PanelListing {
  id: string;
  sold30d: number | null;
  demandTier: string;
  demandSource: string;
  purchaseHistoryAt: string | null;
  minSold30d: number;
  winner: boolean;
  bestSource: { title: string; url: string; priceMinor: number; rating: number; netProfitMinor: number; marginPct: number } | null;
}

const PANEL_ID = "hunter-companion-panel";

const css = `
#${PANEL_ID}{all:initial;display:block;margin:10px 0;padding:10px 12px;border:1px solid #c3c6d7;border-radius:10px;background:#f7f9fb;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#191c1e}
#${PANEL_ID} *{font:inherit;color:inherit;box-sizing:border-box}
#${PANEL_ID} .row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${PANEL_ID} .brand{font-weight:600;color:#2563eb}
#${PANEL_ID} .big{font-size:18px;font-weight:700}
#${PANEL_ID} .pill{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid #c3c6d7;font-size:11px}
#${PANEL_ID} .ok{background:#e7f6ec;border-color:#a7dcb9;color:#0d7a3f}
#${PANEL_ID} .warn{background:#fff4e5;border-color:#f3cf9a;color:#943700}
#${PANEL_ID} .muted{color:#434655}
#${PANEL_ID} button{cursor:pointer;padding:3px 10px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-weight:600}
#${PANEL_ID} button.ghost{background:#fff;color:#2563eb}
#${PANEL_ID} button:disabled{opacity:.55;cursor:default}
#${PANEL_ID} a{color:#2563eb;text-decoration:underline}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function mountPoint(): HTMLElement {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  const style = el("style", {}, css);
  document.head.append(style);
  panel = el("div", { id: PANEL_ID });
  const title = document.querySelector(".x-item-title, h1.x-item-title__mainTitle, #itemTitle, h1");
  if (title?.parentElement) title.parentElement.insertBefore(panel, title.nextSibling);
  else document.body.prepend(panel);
  return panel;
}

/** Opens the app's Source finder for this listing (works on every eBay site). */
function findSourceButton() {
  const btn = el("button", { class: "ghost" }, "Find AliExpress source");
  btn.addEventListener("click", async () => {
    const { appUrl } = await getSettings();
    window.open(`${appUrl}/source-finder?url=${encodeURIComponent(location.href)}`, "_blank", "noopener");
  });
  return btn;
}

/** Demand tracking (purchase history, hunts) is built for eBay US; other sites get the Source finder only. */
function isHunterSite() {
  return location.hostname === "www.ebay.com" || location.origin === EBAY_ORIGIN;
}

async function render(state?: { busy?: string; error?: string }) {
  const itemUrl = location.href;
  const panel = mountPoint();
  if (!isHunterSite()) {
    const row = el("div", { class: "row" });
    row.append(
      el("span", { class: "brand" }, "Hunter"),
      el("span", { class: "muted" }, "Find this product on AliExpress, scored by title and photo"),
      findSourceButton(),
    );
    panel.replaceChildren(row);
    return;
  }
  panel.replaceChildren(el("div", { class: "row" }, "Hunter: loading…"));

  let listing: PanelListing | null = null;
  let error = state?.error;
  try {
    listing = (await send<{ listing: PanelListing | null }>({ type: "lookup", itemUrl })).listing;
  } catch (e) {
    error = error ?? (e instanceof Error ? e.message : String(e));
  }

  const row = el("div", { class: "row" });
  row.append(el("span", { class: "brand" }, "Hunter"));
  if (listing?.sold30d != null) {
    const exact = listing.demandSource === "purchase_history";
    row.append(el("span", { class: "big" }, `${listing.sold30d} sold / 30d`));
    row.append(
      el(
        "span",
        { class: `pill ${exact || listing.demandTier === "VERIFIED" ? "ok" : "warn"}` },
        exact ? "exact · eBay purchase history" : listing.demandTier.toLowerCase(),
      ),
    );
    if (listing.winner) row.append(el("span", { class: "pill ok" }, "Winner"));
  } else if (listing) {
    row.append(el("span", { class: "muted" }, "Tracked · sold count pending"));
  } else if (!error) {
    row.append(el("span", { class: "muted" }, "Not tracked yet"));
  }

  const verify = el("button", {}, state?.busy === "verify" ? "Checking…" : "Verify now");
  verify.toggleAttribute("disabled", Boolean(state?.busy));
  verify.addEventListener("click", async () => {
    await render({ busy: "verify" });
    try {
      await send({ type: "verifyNow", itemUrl });
      await render();
    } catch (e) {
      await render({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  row.append(verify);

  if (!listing) {
    const track = el("button", { class: "ghost" }, state?.busy === "track" ? "Adding…" : "Track in Hunter");
    track.toggleAttribute("disabled", Boolean(state?.busy));
    track.addEventListener("click", async () => {
      await render({ busy: "track" });
      try {
        await send({ type: "track", itemUrl });
        await render();
      } catch (e) {
        await render({ error: e instanceof Error ? e.message : String(e) });
      }
    });
    row.append(track);
  }
  row.append(findSourceButton());
  panel.replaceChildren(row);

  if (listing?.bestSource) {
    const s = listing.bestSource;
    const src = el("div", { class: "row muted" });
    src.append(
      el(
        "span",
        {},
        `AliExpress ${money(s.priceMinor)} · ★${s.rating.toFixed(2)} · profit ${money(s.netProfitMinor)} (${s.marginPct.toFixed(1)}%)`,
      ),
    );
    const link = el("a", { href: s.url, target: "_blank", rel: "noreferrer" }, "open source");
    src.append(link);
    panel.append(src);
  }
  if (error) panel.append(el("div", { class: "row warn" }, error));
}

if (ebayItemIdFromUrl(location.href)) void render();
