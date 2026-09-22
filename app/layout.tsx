import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { bodyFont, monoFont } from "@/lib/fonts";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "IRM Ministries",
  description:
    "Manage members and record attendance with QR codes for IRM Ministries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
