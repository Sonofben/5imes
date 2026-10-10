import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — scheduled attendance`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.tagline} GPS check-in at approved offices and approved homes on scheduled days.`,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#12141a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
