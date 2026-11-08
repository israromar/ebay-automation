import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev proxy default is 30s. A hunt step is budgeted at 45s and can run a bit past that.
  experimental: { proxyTimeout: 90_000 },
  serverExternalPackages: ["@prisma/client", "sharp"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ebayimg.com" },
      { protocol: "https", hostname: "ae01.alicdn.com" },
      { protocol: "https", hostname: "*.alicdn.com" },
    ],
  },
};

export default nextConfig;
