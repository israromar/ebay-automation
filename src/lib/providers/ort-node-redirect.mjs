/**
 * ESM loader: redirect onnxruntime-node → onnxruntime-web.
 * Needed when the native darwin/x64 (or other) ORT binary is missing
 * (e.g. Rosetta x64 Node, or ORT builds that only ship darwin/arm64).
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "onnxruntime-node") {
    return nextResolve("onnxruntime-web", context);
  }
  return nextResolve(specifier, context);
}
