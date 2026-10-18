import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, TRIAL_DAYS, type PlanId } from "@/lib/constants";
import { PublicPlans } from "./jsonShapes.ts";

export type PlanInfo = { id: PlanId; name: string; pricePerSeat: number; blurb: string; features: readonly string[]; maxLocations?: number | null };
export type PlanCatalog = { plans: Record<PlanId, PlanInfo>; trialDays: number };

/**
 * Current plans, prices and trial length as set in Global Admin.
 * Falls back to the built-in defaults if the settings can't be read.
 */
export async function loadPlans(supabase: SupabaseClient): Promise<PlanCatalog> {
  const fallback: PlanCatalog = { plans: { basic: { ...PLANS.basic }, pro: { ...PLANS.pro } }, trialDays: TRIAL_DAYS };
  try {
    const { data, error } = await supabase.rpc("public_plans");
    if (error || !data) return fallback;
    const parsed = PublicPlans.safeParse(data);
    if (!parsed.success) return fallback;
    const raw = parsed.data;
    const plans = { ...fallback.plans };
    for (const p of raw.plans ?? []) {
      if (p.id in plans && Number.isSafeInteger(p.pricePerSeat) && p.pricePerSeat > 0) {
        plans[p.id] = { id: p.id, name: p.name, pricePerSeat: p.pricePerSeat, blurb: p.blurb, features: p.features?.length ? p.features : plans[p.id].features, maxLocations: p.maxLocations ?? null };
      }
    }
    return { plans, trialDays: raw.trial_days ?? TRIAL_DAYS };
  } catch {
    return fallback;
  }
}

/** Same as loadPlans, for public pages: no sign-in cookies, so the page can be cached. */
// Public prices are read by every visit to the home page; keep them for 5 minutes so
// heavy traffic (or someone hammering the page) doesn't become database load.
let publicCache: { at: number; value: PlanCatalog } | null = null;
const PUBLIC_TTL_MS = 5 * 60 * 1000;

export async function loadPublicPlans(): Promise<PlanCatalog> {
  if (publicCache && Date.now() - publicCache.at < PUBLIC_TTL_MS) return publicCache.value;
  const value = await fetchPublicPlans();
  publicCache = { at: Date.now(), value };
  return value;
}

async function fetchPublicPlans(): Promise<PlanCatalog> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { createClient } = await import("@supabase/supabase-js");
  if (!url || !key) return loadPlans(null as unknown as SupabaseClient);
  return loadPlans(createClient(url, key, { auth: { persistSession: false } }));
}
