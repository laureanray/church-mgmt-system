import { IBM_Plex_Sans, Geist_Mono } from "next/font/google";

/** Shared font configuration for the app and Storybook, including portals. */
export const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const monoFont = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});
