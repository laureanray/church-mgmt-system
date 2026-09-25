import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local manager supplies only the selected LAN/Tailscale host.
  allowedDevOrigins: process.env.IRM_DEV_HOST
    ? [process.env.IRM_DEV_HOST]
    : [],
  experimental: {
    // How long the browser may reuse a page it already rendered before asking
    // the server again. Every route here is dynamic, and Next's default for
    // those is 0 — so returning to the members list you left ten seconds ago
    // was a fresh round trip to Singapore, auth check and queries included.
    //
    // Staleness is bounded where it matters: every server action calls
    // revalidatePath or redirect, which purges this cache, so your own edits
    // always show. Only another staff member's change can lag, by at most the
    // window below. See docs/performance.md.
    staleTimes: {
      // Pages you have visited.
      dynamic: 30,
      // Pages fully prefetched by IntentLink (and truly static pages). Kept
      // well under Next's 5-minute default, which is too long to show a
      // prefetched members list without a refetch.
      static: 60,
    },
  },
};

export default nextConfig;
