import type { Metadata } from "next";
import { kioskAdmin, kioskToken } from "@/lib/kiosk";
import { KioskContext, parseOrNull } from "@/lib/jsonShapes";
import { KioskApp } from "./KioskApp";
import { PairTablet } from "./PairTablet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitor sign-in", robots: { index: false, follow: false } };

/** Reception tablet. Paired tablets show visitor sign-in; others show the pairing screen. */
export default async function Kiosk() {
  const token = await kioskToken();
  if (!token) return <PairTablet />;
  const { data, error } = await kioskAdmin().rpc("kiosk_context", { p_token: token });
  const ctx = error ? null : parseOrNull(KioskContext, data, "kiosk/page");
  if (!ctx) {
    const premium = (error as { code?: string } | null)?.code === "KF403";
    return <PairTablet notice={premium ? "Visitor management needs the Premium plan. Ask an admin to upgrade, then pair this tablet again." : "This tablet was switched off or needs to be set up again."} />;
  }
  return <KioskApp ctx={{
    deviceName: ctx.device_name, timezone: ctx.org.timezone, orgName: ctx.org.name, logoUrl: ctx.org.logo_url ?? null, brandColor: ctx.org.brand_color ?? null, accentColor: ctx.org.accent_color ?? null,
    office: ctx.location?.name ?? "Reception", photoRequired: ctx.photo_required, rulesText: ctx.rules_text,
  }} />;
}
