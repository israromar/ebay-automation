/**
 * Shared ORT WASM path helpers (plain ESM so Next instrumentation / NODE_OPTIONS
 * --import can load this without a TypeScript transpile step).
 *
 * Intel macOS has no onnxruntime-node darwin/x64 binary in current ORT releases,
 * so DINOv2 must run on onnxruntime-web WASM. Under Next, ORT often cannot
 * resolve import.meta.url for ort.node.min.mjs and falls back to process.cwd().
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WASM_FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

export function resolveOrtWebDistDir(fromUrl = import.meta.url) {
  const ortEntry = createRequire(fromUrl).resolve("onnxruntime-web");
  return path.dirname(ortEntry);
}

export function resolveOrtWasmPaths(distDir = resolveOrtWebDistDir()) {
  return {
    mjs: pathToFileURL(path.join(distDir, "ort-wasm-simd-threaded.mjs")).href,
    wasm: pathToFileURL(path.join(distDir, "ort-wasm-simd-threaded.wasm")).href,
    prefix: pathToFileURL(distDir + path.sep).href,
  };
}

/**
 * When Next loses ORT's script URL, dynamic import resolves
 * `./ort-wasm-simd-threaded.mjs` against process.cwd(). Symlink the assets
 * there so that fallback still works.
 */
export function ensureOrtWasmCwdFallback(distDir = resolveOrtWebDistDir(), cwd = process.cwd()) {
  for (const file of WASM_FILES) {
    const source = path.join(distDir, file);
    const target = path.join(cwd, file);
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(target)) {
      try {
        if (fs.realpathSync(target) === fs.realpathSync(source)) continue;
      } catch {
        // replace stale/broken link or wrong file
      }
      try {
        fs.rmSync(target);
      } catch {
        continue;
      }
    }
    try {
      fs.symlinkSync(source, target);
    } catch {
      try {
        fs.copyFileSync(source, target);
      } catch {
        // best-effort; explicit wasmPaths should still cover the normal path
      }
    }
  }
}

export function applyOrtWasmPaths(wasmEnv, distDir = resolveOrtWebDistDir()) {
  if (!wasmEnv) return resolveOrtWasmPaths(distDir);
  const paths = resolveOrtWasmPaths(distDir);
  wasmEnv.numThreads = 1;
  wasmEnv.proxy = false;
  // Explicit file URLs beat prefix resolution when import.meta.url is unavailable.
  wasmEnv.wasmPaths = { mjs: paths.mjs, wasm: paths.wasm };
  return paths;
}
