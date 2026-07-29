import { createRequire, register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type TransformersModule = typeof import("@huggingface/transformers");

let loadPromise: Promise<TransformersModule> | null = null;
let redirectRegistered = false;

function isNativeOrtAvailable(): boolean {
  try {
    createRequire(import.meta.url)("onnxruntime-node");
    return true;
  } catch {
    return false;
  }
}

function registerOrtWebRedirect() {
  if (redirectRegistered) return;
  redirectRegistered = true;
  const loaderPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "ort-node-redirect.mjs");
  register(pathToFileURL(loaderPath).href);
}

function configureWasmBackend(env: TransformersModule["env"]) {
  const ortEntry = createRequire(import.meta.url).resolve("onnxruntime-web");
  const distDir = path.dirname(ortEntry) + path.sep;

  env.allowLocalModels = false;
  // Blob-URL WASM factory breaks under Node's ESM loader ("blob:" not supported).
  env.useWasmCache = false;

  const wasm = env.backends?.onnx?.wasm;
  if (!wasm) return;

  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = pathToFileURL(distDir).href;
}

/**
 * Loads @huggingface/transformers, falling back to onnxruntime-web (WASM)
 * when the native onnxruntime-node binding is unavailable
 * (e.g. Rosetta x64 Node / missing darwin-x64 ORT binary).
 */
export async function loadTransformers(): Promise<TransformersModule> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const useWasmFallback = !isNativeOrtAvailable();
    if (useWasmFallback) {
      registerOrtWebRedirect();
    }

    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = false;

    if (useWasmFallback || transformers.env.backends?.onnx?.wasm) {
      configureWasmBackend(transformers.env);
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
