import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — hybrid attendance`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.tagline} GPS check-in for office and home, built for Nigerian teams.`,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#12141a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
