/**
 * Skip AliExpress Bundle Deals / SuperDeals / "Pick 3" pages. Those live under /ssr/ or /gcp/ with the
 * real product in `productIds=<id>:<sku>,…`, and hide or inflate the single-item price.
 * The declarativeNetRequest rule catches direct navigations; this script also rewrites links on
 * search/listing pages and handles in-app navigations the rule can't see.
 */

const KEY = "hunterBundleSkip";

function unbundle(href: string): string | null {
  try {
    const url = new URL(href, location.href);
    if (!/(^|\.)aliexpress\.[a-z.]+$/i.test(url.hostname) || !/^\/(ssr|gcp)\//i.test(url.pathname)) return null;
    const id = (url.searchParams.get("productIds") ?? url.searchParams.get("productId") ?? url.searchParams.get("x_object_id") ?? "")
      .split(/[,:]/)[0]
      ?.trim();
    return id && /^\d{8,20}$/.test(id) ? `https://www.aliexpress.com/item/${id}.html` : null;
  } catch {
    return null;
  }
}

function rewriteLinks(root: ParentNode) {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href*='productIds='], a[href*='/ssr/'], a[href*='/gcp/']")) {
    const target = unbundle(a.href);
    if (target && a.href !== target) {
      a.dataset.hunterOriginal = a.href;
      a.href = target;
    }
  }
}

async function main() {
  const stored = (await chrome.storage.local.get("settings")).settings as { bundleSkip?: boolean } | undefined;
  if (stored?.bundleSkip === false) return;

  const here = unbundle(location.href);
  if (here && !sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, "1");
    location.replace(here);
    return;
  }
  rewriteLinks(document);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) rewriteLinks(n);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

void main();
