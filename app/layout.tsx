import type { Metadata } from "next";
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
      className={`${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
