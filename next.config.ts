import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;