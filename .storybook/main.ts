import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// Set by `scripts/storybook-network.sh` to this machine's tailnet addresses.
//
// Binding to 0.0.0.0 listens on *every* interface, including whatever café
// wifi the laptop is on, and Storybook otherwise accepts any `Host` header —
// which is what makes a DNS-rebinding attack reach a dev server. Naming the
// hosts narrows it back to the tailnet, and silences Storybook's warning about
// allowing all of them.
const allowedHosts = process.env.STORYBOOK_ALLOWED_HOSTS?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const config: StorybookConfig = {
  ...(allowedHosts?.length ? { core: { allowedHosts } } : {}),
  stories: [
    "../.storybook/**/*.stories.@(ts|tsx)",
    "../components/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  async viteFinal(config) {
    // Storybook builds with Vite while the app builds with Turbopack, so
    // Tailwind has to be wired up a second time here. Same `app/globals.css`,
    // same tokens — only the bundler differs.
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    config.resolve = {
      ...config.resolve,
      alias: { ...config.resolve?.alias, "@": projectRoot.replace(/\/$/, "") },
    };
    return config;
  },
};

export default config;
