import type { NextConfig } from "next";

const exposeTestingApi =
  process.env.EXPOSE_TESTING_API === "1"
  && process.env.VERCEL_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: exposeTestingApi,
  },
};

export default nextConfig;
