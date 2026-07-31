/**
 * Early ORT bootstrap for Next / Node.
 * - Redirects onnxruntime-node → onnxruntime-web when the native binding is missing
 *   (Intel macOS: ORT does not ship darwin/x64 in current npm packages).
 * - Pins absolute WASM asset URLs and CWD fallbacks so Next can load DINOv2.
 *
 * Do NOT assign globalThis[Symbol.for("onnxruntime")] before transformers loads:
 * that skips Node device registration and leaves supportedDevices empty.
 *
 * Loaded via:
 * - instrumentation.ts (Next server)
 * - NODE_OPTIONS --import (dev/worker scripts)
 * - loadTransformers() as a last-resort self-bootstrap
 */
import { createRequire, register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyOrtWasmPaths, ensureOrtWasmCwdFallback, resolveOrtWebDistDir } from "./ort-wasm-assets.mjs";

const require = createRequire(import.meta.url);

let bootstrapped = false;
let usedWasmFallback = false;

function isNativeOrtAvailable() {
  try {
    require("onnxruntime-node");
    return true;
  } catch {
    return false;
  }
}

function registerOrtWebRedirect() {
  const loaderPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "ort-node-redirect.mjs");
  register(pathToFileURL(loaderPath).href);
}

export async function ensureOrtRuntime() {
  if (bootstrapped) return { usedWasmFallback };
  bootstrapped = true;

  const distDir = resolveOrtWebDistDir(import.meta.url);
  ensureOrtWasmCwdFallback(distDir);

  usedWasmFallback = !isNativeOrtAvailable();
  if (usedWasmFallback) {
    registerOrtWebRedirect();
    const ort = await import("onnxruntime-web");
    applyOrtWasmPaths(ort.env?.wasm, distDir);
  }

  return { usedWasmFallback };
}

// Side-effect entry for `node --import ./src/lib/providers/register-ort-loader.mjs`
await ensureOrtRuntime();
