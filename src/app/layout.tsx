import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { BRAND } from "@/lib/constants";
import { publicOrigin } from "@/lib/site";

const description = `${BRAND.tagline} GPS check-in at approved offices and approved homes on scheduled days. From ₦250 per employee per month.`;

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — scheduled attendance`, template: `%s · ${BRAND.name}` },
  metadataBase: new URL(publicOrigin()),
  description,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — scheduled attendance for hybrid teams`,
    description,
    locale: "en_NG",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: BRAND.name }],
  },
  twitter: { card: "summary", title: `${BRAND.name} — scheduled attendance`, description, images: ["/icon-512.png"] },
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
