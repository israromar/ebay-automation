/**
 * Smoke probe for DINOv2 / ORT WASM loading.
 * Usage: npm run visual:probe
 */
import { loadTransformers } from "../src/lib/providers/load-transformers.ts";

const { pipeline, env } = await loadTransformers();
console.log("wasmPaths", env.backends?.onnx?.wasm?.wasmPaths);

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const extractor = await pipeline("image-feature-extraction", "Xenova/dinov2-small", {
  device: "cpu",
  dtype: "fp32",
});
const out = await extractor(new Blob([png], { type: "image/png" }), { pooling: "mean", normalize: true });
console.log("ok dims", out.dims, "len", out.data?.length);
