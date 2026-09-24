/**
 * Times authenticated routes against a running production build.
 *
 *   bun run build && PORT=3999 bun run start
 *   bun run perf:probe                      # every sidebar route
 *   bun run perf:probe /members /members/new
 *
 * Signs in as the seeded admin through the local Supabase Auth, builds the
 * same session cookie @supabase/ssr would, and for each route reports the
 * median server time, the HTML of a page load, the RSC payload of a client
 * navigation, and the gzipped JavaScript the page loads. See
 * docs/performance.md for what the numbers should look like.
 *
 * Local numbers measure the app's own work only — no Pacific, no pooler — so
 * compare them against each other, not against production.
 */
import { gzipSync } from "bun";

const BASE = process.env.PERF_BASE ?? "http://localhost:3999";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL = process.env.PERF_EMAIL ?? "admin@church.local";
const PASSWORD = process.env.PERF_PASSWORD ?? "admin123";
const RUNS = 6;

const DEFAULT_ROUTES = [
  "/dashboard",
  "/scan",
  "/members",
  "/cell-groups",
  "/services",
  "/users",
  "/roles",
  "/settings",
];

/**
 * The router state a browser sits in on a top-level (app) page, as it sends it
 * in `Next-Router-State-Tree` — captured from a real navigation, flags and all.
 * Next's internal format: if an upgrade changes it, the navigation column
 * reads `ERR 500`, and this needs recapturing from the request headers of a
 * sidebar click in the browser's Network tab.
 */
function routerStateOn(segment: string) {
  return encodeURIComponent(
    JSON.stringify([
      "",
      {
        children: [
          "(app)",
          {
            children: [
              segment,
              { children: ["__PAGE__", {}, null, null, 0] },
              null,
              null,
              0,
            ],
          },
          null,
          null,
          4,
        ],
      },
      null,
      null,
      24,
    ]),
  );
}

async function sessionCookie() {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
  );
  const session = await response.json();
  if (!session.access_token) {
    throw new Error(`Sign-in failed: ${JSON.stringify(session)}`);
  }

  // @supabase/ssr's format: base64url JSON, split into 3180-character chunks.
  const name = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks = value.match(/.{1,3180}/g)!;
  return chunks.length === 1
    ? `${name}=${value}`
    : chunks.map((chunk, i) => `${name}.${i}=${chunk}`).join("; ");
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)}KB`;

const cookie = await sessionCookie();
const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
const chunkSizes = new Map<string, number>();

console.log("route".padEnd(22), "status  server   html    nav-rsc  js(gz)");

for (const route of routes) {
  const times: number[] = [];
  let html = "";
  let status = 0;

  // The first run warms the route's module graph and is discarded.
  for (let i = 0; i <= RUNS; i++) {
    const start = performance.now();
    const response = await fetch(BASE + route, {
      headers: { cookie },
      redirect: "manual",
    });
    html = await response.text();
    status = response.status;
    if (i > 0) times.push(performance.now() - start);
  }

  // A client navigation sends the router's current tree, and the server skips
  // every layout it already holds. Without it, `RSC: 1` alone returns the whole
  // route, (app) layout included, and overstates the navigation by ~11KB.
  // Measured as a sidebar click from the dashboard (or, for the dashboard
  // itself, from settings — a navigation to where you already are is empty).
  const from = route === "/dashboard" ? "settings" : "dashboard";
  const navigation = await fetch(BASE + route, {
    headers: {
      cookie,
      RSC: "1",
      "Next-Router-State-Tree": routerStateOn(from),
      "Next-Url": `/${from}`,
    },
  });
  const navigationSize = navigation.ok
    ? kb((await navigation.text()).length)
    : `ERR ${navigation.status}`;

  let js = 0;
  const scripts = new Set(
    [...html.matchAll(/\/_next\/static\/chunks\/[^"'\\]+\.js/g)].map((m) => m[0]),
  );
  for (const src of scripts) {
    if (!chunkSizes.has(src)) {
      const body = await fetch(BASE + src).then((r) => r.arrayBuffer());
      chunkSizes.set(src, gzipSync(new Uint8Array(body)).length);
    }
    js += chunkSizes.get(src)!;
  }

  console.log(
    route.padEnd(22),
    String(status).padEnd(7),
    `${median(times).toFixed(0)}ms`.padEnd(8),
    kb(html.length).padEnd(7),
    navigationSize.padEnd(8),
    kb(js),
  );
}
