import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paystack, paystackEnabled } from "@/lib/paystack";
import { PLANS, type PlanId } from "@/lib/constants";
import type { Member } from "@/lib/session";

export async function POST(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const back = (q: Record<string, string>) =>
    NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams(q)}`, { status: 303 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, { status: 303 });

  const { data: me } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle<Member>();
  if (!me || me.status !== "active" || !["owner", "admin"].includes(me.role)) return back({ error: "Only admins can pay." });

  const form = await request.formData();
  const plan = String(form.get("plan")) as PlanId;
  if (!(plan in PLANS)) return back({ error: "Unknown plan." });

  if (!paystackEnabled()) return back({ error: "Online payment is not switched on yet. Contact us to activate your plan." });

  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", me.org_id)
    .in("status", ["active", "invited"]);
  const seats = Math.max(1, count ?? 1);

  try {
    const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: seats * PLANS[plan].pricePerSeat * 100, // kobo
        currency: "NGN",
        reference: `5ime_${me.org_id.slice(0, 8)}_${Date.now()}`,
        callback_url: `${base}/api/paystack/verify`,
        ...(process.env.PAYSTACK_SUBACCOUNT ? { subaccount: process.env.PAYSTACK_SUBACCOUNT } : {}),
        metadata: {
          org_id: me.org_id,
          plan,
          seats,
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: PLANS[plan].name },
            { display_name: "Seats", variable_name: "seats", value: String(seats) },
          ],
        },
      }),
    });
    return NextResponse.redirect(data.authorization_url, { status: 303 });
  } catch (e) {
    return back({ error: e instanceof Error ? e.message : "Could not start payment." });
  }
}
