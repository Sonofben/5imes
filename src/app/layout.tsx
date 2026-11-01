import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { BRAND } from "@/lib/constants";
import { isStaging, publicOrigin } from "@/lib/site";

const description = "Staff attendance and visitor management for modern teams: GPS check in at the office, an approved home or a client site, and visitors who sign in on their own phone. No hardware needed.";

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: staff attendance and visitor management`, template: `%s · ${BRAND.name}` },
  metadataBase: new URL(publicOrigin()),
  description,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name}: staff attendance and visitor management`,
    description,
    locale: "en_NG",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: BRAND.name }],
  },
  twitter: { card: "summary", title: `${BRAND.name}: staff attendance and visitor management`, description, images: ["/icon-512.png"] },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request so each one carries that request's CSP nonce
  // (a page built ahead of time would have no nonce and its scripts would be blocked).
  await connection();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {isStaging() && (
          <div role="status" className="sticky top-0 z-[100] bg-amber-400 px-4 py-1.5 text-center text-xs font-bold text-ink print:hidden">
            STAGING — test copy of 5imes. Data here is not real and may be wiped.
          </div>
        )}
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
