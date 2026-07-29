import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@huggingface/transformers", "onnxruntime-node", "onnxruntime-web", "sharp"],
};

export default nextConfig;
