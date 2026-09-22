import type { NextConfig } from "next";

const isDesktopBuild = process.env.DESKTOP_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isDesktopBuild ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
