/**
 * Build the Hunter Companion Chrome extension (MV3) into extension/dist and package it as
 * public/hunter-companion.zip so the web app can offer it for download (Settings → Connect extension).
 *
 *   npm run ext:build
 *
 * HUNTER_APP_URL      app origin baked in as the default + granted host permission
 *                     (falls back to Vercel's production URL, then http://localhost:3000)
 * EXT_EBAY_ORIGIN     test builds only: point purchase-history fetches at a mock eBay
 */
import { build } from "esbuild";
import { zipSync } from "fflate";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";

const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "extension");
const dist = path.join(extDir, "dist");
const zipPath = path.join(root, "public", "hunter-companion.zip");

function appUrl(): string {
  const explicit = process.env.HUNTER_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

const APP_URL = appUrl();
const EBAY_ORIGIN = (process.env.EXT_EBAY_ORIGIN?.trim() || "https://www.ebay.com").replace(/\/+$/, "");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#2563eb"/>
  <path d="M64 22c6 16 26 26 26 50a26 26 0 0 1-52 0c0-12 6-20 12-26 1 8 5 13 10 15-3-15 0-27 4-39z" fill="#fff"/>
  <path d="M64 80c4 5 9 8 9 14a9 9 0 0 1-18 0c0-6 5-9 9-14z" fill="#2563eb"/>
</svg>`;

function manifest() {
  const appOrigin = `${new URL(APP_URL).origin}/*`;
  const ebayMatch = `${EBAY_ORIGIN}/*`;
  return {
    manifest_version: 3,
    name: "Hunter Companion",
    version: pkg.version.replace(/[^0-9.]/g, "") || "0.1.0",
    description: "Exact eBay 30-day sold counts from purchase history for Winning Product Hunter, and skips AliExpress bundle deals.",
    icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
    action: { default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
    options_page: "options.html",
    background: { service_worker: "background.js" },
    permissions: ["storage", "alarms", "declarativeNetRequest"],
    host_permissions: [
      ...new Set([ebayMatch, "https://www.ebay.com/*", "https://*.aliexpress.com/*", "https://*.aliexpress.us/*", appOrigin]),
    ],
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    declarative_net_request: { rule_resources: [{ id: "bundle_skip", enabled: true, path: "rules.json" }] },
    content_scripts: [
      {
        matches: [
          ...new Set([
            "https://www.ebay.com/itm/*",
            `${EBAY_ORIGIN}/itm/*`,
            ...["co.uk", "de", "fr", "it", "es", "com.au", "ca"].map((tld) => `https://www.ebay.${tld}/itm/*`),
          ]),
        ],
        js: ["content-ebay.js"],
        run_at: "document_idle",
      },
      { matches: ["https://*.aliexpress.com/*", "https://*.aliexpress.us/*"], js: ["content-aliexpress.js"], run_at: "document_start" },
    ],
  };
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

async function main() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(path.join(dist, "icons"), { recursive: true });

  await build({
    entryPoints: ["background", "content-ebay", "content-aliexpress", "popup", "options"].map((n) => path.join(extDir, "src", `${n}.ts`)),
    outdir: dist,
    bundle: true,
    format: "iife",
    target: "chrome114",
    minify: false,
    legalComments: "none",
    logLevel: "warning",
    define: {
      __HUNTER_APP_URL__: JSON.stringify(APP_URL),
      __EBAY_ORIGIN__: JSON.stringify(EBAY_ORIGIN),
    },
  });

  cpSync(path.join(extDir, "static"), dist, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await sharp(Buffer.from(ICON_SVG))
      .resize(size, size)
      .png()
      .toFile(path.join(dist, "icons", `${size}.png`));
  }
  writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest(), null, 2));

  const files = Object.fromEntries(
    listFiles(dist).map((f) => [`hunter-companion/${f.split(path.sep).join("/")}`, readFileSync(path.join(dist, f))]),
  );
  mkdirSync(path.dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, zipSync(files, { level: 9 }));

  console.log(
    `Hunter Companion → ${path.relative(root, dist)} and ${path.relative(root, zipPath)} (app ${APP_URL}${EBAY_ORIGIN !== "https://www.ebay.com" ? `, eBay ${EBAY_ORIGIN}` : ""})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
