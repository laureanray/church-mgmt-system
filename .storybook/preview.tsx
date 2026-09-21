import * as React from "react";
import { Manrope, DM_Sans, Lora } from "next/font/google";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/nextjs-vite";

import "../app/globals.css";
import { bodyFont, monoFont } from "../lib/fonts";

const manrope = Manrope({ variable: "--font-explore-manrope", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-explore-dm", subsets: ["latin"] });
const lora = Lora({ variable: "--font-explore-lora", subsets: ["latin"] });

// Font variables belong on <html> so portalled menus and dialogs inherit them too.
function StoryFonts({ children }: { children: React.ReactNode }) {
  React.useLayoutEffect(() => {
    const classes = [bodyFont.variable, monoFont.variable, manrope.variable, dmSans.variable, lora.variable];
    document.documentElement.classList.add(...classes);
    return () => document.documentElement.classList.remove(...classes);
  }, []);
  return <div className="font-sans text-foreground">{children}</div>;
}

const preview: Preview = {
  parameters: {
    // Match the app's router so next/navigation hooks in menus have context.
    nextjs: { appDirectory: true },
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
    (Story) => <StoryFonts><Story /></StoryFonts>,
  ],
};

export default preview;
