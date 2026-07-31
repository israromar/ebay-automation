import { applyOrtWasmPaths, ensureOrtWasmCwdFallback, resolveOrtWebDistDir } from "./ort-wasm-assets.mjs";

export type TransformersModule = typeof import("@huggingface/transformers");

let loadPromise: Promise<TransformersModule> | null = null;

/**
 * Loads @huggingface/transformers with a durable ORT setup:
 * - Native onnxruntime-node when the platform binary exists
 * - Otherwise onnxruntime-web WASM with absolute asset URLs + CWD fallbacks
 *   (required on Intel macOS and under Next, where ORT loses import.meta.url)
 */
export async function loadTransformers(): Promise<TransformersModule> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { ensureOrtRuntime } = await import("./register-ort-loader.mjs");
    const { usedWasmFallback } = await ensureOrtRuntime();

    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = false;
    // Blob-URL WASM factory breaks under Node's ESM loader ("blob:" not supported).
    transformers.env.useWasmCache = false;

    if (usedWasmFallback || transformers.env.backends?.onnx?.wasm) {
      const distDir = resolveOrtWebDistDir();
      ensureOrtWasmCwdFallback(distDir);
      applyOrtWasmPaths(transformers.env.backends?.onnx?.wasm, distDir);
    }

    return transformers;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}
