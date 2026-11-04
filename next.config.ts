import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page behind /login reads the session cookie, so nothing here can be
  // prerendered. Cache Components would only force Suspense boundaries that
  // buy this app nothing.
  cacheComponents: false,
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "bcryptjs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
