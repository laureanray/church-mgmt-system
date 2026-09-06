import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const config: StorybookConfig = {
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
  staticDirs: ["../public"],
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
