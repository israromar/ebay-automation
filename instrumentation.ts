export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  await import("./src/lib/providers/register-ort-loader.mjs");
}
