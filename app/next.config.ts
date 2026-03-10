import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for desktop packaging (Electron): run Next server from standalone output.
  output: "standalone",
};

export default nextConfig;
