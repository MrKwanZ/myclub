import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@myclub/shared"],
  async redirects() {
    return [{ source: "/settings", destination: "/account", permanent: false }];
  },
};

export default nextConfig;
