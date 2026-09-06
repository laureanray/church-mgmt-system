import * as React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/nextjs-vite";

import "../app/globals.css";

// The same two faces `app/layout.tsx` loads, so a story is typeset exactly as
// the page will be. They publish CSS variables, which `globals.css` reads.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // The theme switcher already swaps the canvas via the `dark` class on
    // <html>; a second background control would only let the two disagree.
    backgrounds: { disable: true },
    // Reported in the a11y panel per story. It is not wired to a test runner:
    // the UI suite in tests/ui asserts roles and accessible names instead.
    a11y: { test: "todo" },
    options: {
      storySort: {
        order: ["Foundations", "UI", "Patterns"],
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      // `dark` has to land on <html>, not on the story wrapper: the custom
      // variant is `&:is(.dark *)`, which matches descendants of `.dark` but
      // never the element carrying the class.
      parentSelector: "html",
    }),
    (Story) => (
      <div
        className={`${geistSans.variable} ${geistMono.variable} font-sans text-foreground`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
