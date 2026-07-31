import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyOrtWasmPaths, ensureOrtWasmCwdFallback, resolveOrtWasmPaths, resolveOrtWebDistDir } from "../ort-wasm-assets.mjs";

describe("ort wasm assets", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves absolute mjs/wasm file URLs under onnxruntime-web/dist", () => {
    const distDir = resolveOrtWebDistDir();
    const paths = resolveOrtWasmPaths(distDir);
    expect(paths.mjs).toBe(pathToFileURL(path.join(distDir, "ort-wasm-simd-threaded.mjs")).href);
    expect(paths.wasm).toBe(pathToFileURL(path.join(distDir, "ort-wasm-simd-threaded.wasm")).href);
    expect(fs.existsSync(path.join(distDir, "ort-wasm-simd-threaded.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(distDir, "ort-wasm-simd-threaded.wasm"))).toBe(true);
  });

  it("applies explicit wasmPaths onto an ORT wasm env object", () => {
    const wasmEnv: { numThreads?: number; proxy?: boolean; wasmPaths?: unknown } = {};
    const paths = applyOrtWasmPaths(wasmEnv);
    expect(wasmEnv.numThreads).toBe(1);
    expect(wasmEnv.proxy).toBe(false);
    expect(wasmEnv.wasmPaths).toEqual({ mjs: paths.mjs, wasm: paths.wasm });
  });

  it("symlinks WASM assets into cwd so Next's CWD fallback can resolve them", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ort-wasm-cwd-"));
    tempDirs.push(cwd);
    const distDir = resolveOrtWebDistDir();
    ensureOrtWasmCwdFallback(distDir, cwd);
    expect(fs.existsSync(path.join(cwd, "ort-wasm-simd-threaded.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, "ort-wasm-simd-threaded.wasm"))).toBe(true);
    expect(fs.realpathSync(path.join(cwd, "ort-wasm-simd-threaded.mjs"))).toBe(
      fs.realpathSync(path.join(distDir, "ort-wasm-simd-threaded.mjs")),
    );
  });
});
