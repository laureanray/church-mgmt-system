import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local manager supplies only the selected LAN/Tailscale host.
  allowedDevOrigins: process.env.IRM_DEV_HOST
    ? [process.env.IRM_DEV_HOST]
    : [],
};

export default nextConfig;
