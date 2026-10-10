"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";
import { paystack, paystackEnabled, retrySeatPlanSync } from "@/lib/paystack";

async function updateRenewal(cancelled: boolean): Promise<never> {
  const { org } = await requireMember({ admin: true });
  const admin = createAdminClient();
  if (!admin) redirect("/admin/billing?error=Billing+service+is+not+configured.");
  if (!paystackEnabled()) redirect("/admin/billing?error=Paystack+is+not+configured.");

  const [{ data: subscription }, { data: credentials }] = await Promise.all([
    admin.from("subscriptions").select("paystack_subscription_code,cancel_at_period_end,current_period_end").eq("org_id", org.id).maybeSingle(),
    admin.from("private_subscription_auth").select("paystack_email_token").eq("org_id", org.id).maybeSingle(),
  ]);
  if (!subscription?.paystack_subscription_code || !credentials?.paystack_email_token) {
    redirect("/admin/billing?error=Subscription+management+is+not+available+for+this+account.");
  }

  if (!cancelled) {
    const { data, error } = await admin.rpc("set_paystack_subscription_cancelled", {
      p_subscription_code: subscription.paystack_subscription_code,
      p_cancelled: false,
      p_expected_updated_at: null,
    });
    if (error || !data) redirect("/admin/billing?error=Resolve+any+pending+checkout+before+restoring+automatic+renewal.");
  }

  try {
    await paystack(cancelled ? "/subscription/disable" : "/subscription/enable", {
      method: "POST",
      body: JSON.stringify({ code: subscription.paystack_subscription_code, token: credentials.paystack_email_token }),
    });
  } catch (error) {
    if (!cancelled) {
      try {
        await paystack("/subscription/disable", {
          method: "POST",
          body: JSON.stringify({ code: subscription.paystack_subscription_code, token: credentials.paystack_email_token }),
        });
        await admin.rpc("set_paystack_subscription_cancelled", {
          p_subscription_code: subscription.paystack_subscription_code,
          p_cancelled: true,
          p_expected_updated_at: null,
        });
      } catch {
        // Keep the local renewal lock on when provider state is uncertain; this blocks overlapping checkout.
      }
    }
    redirect(`/admin/billing?${new URLSearchParams({ error: error instanceof Error ? error.message : "Could not update the renewal setting." })}`);
  }

  if (cancelled) {
    const { data, error } = await admin.rpc("set_paystack_subscription_cancelled", {
      p_subscription_code: subscription.paystack_subscription_code,
      p_cancelled: true,
      p_expected_updated_at: null,
    });
    if (error || !data) {
      redirect("/admin/billing?error=Paystack+updated,+but+the+local+billing+status+needs+reconciliation.");
    }
  } else {
    const { data, error } = await admin.rpc("set_paystack_subscription_cancelled", {
      p_subscription_code: subscription.paystack_subscription_code,
      p_cancelled: false,
      p_expected_updated_at: null,
    });
    if (error || !data) {
      redirect("/admin/billing?error=Paystack+renewal+was+enabled,+but+local+status+needs+reconciliation.");
    }
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/billing");
  const message = cancelled
    ? "Auto-renewal is off. Your current paid access remains available until the period end."
    : "Auto-renewal is back on.";
  redirect(`/admin/billing?${new URLSearchParams({ msg: message })}`);
}

export async function cancelRenewal() { return updateRenewal(true); }
export async function resumeRenewal() { return updateRenewal(false); }

export async function retrySeatRenewalPrice() {
  const { org } = await requireMember({ admin: true });
  const admin = createAdminClient();
  if (!admin) redirect("/admin/billing?error=Billing+service+is+not+configured.");
  const { data: payment, error } = await admin.from("payments").select("reference")
    .eq("org_id", org.id).eq("kind", "seat_increase").eq("status", "applied").eq("renewal_sync_status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) redirect(`/admin/billing?${new URLSearchParams({ error: error.message })}`);
  if (!payment) redirect("/admin/billing?msg=The+recurring+seat+price+is+already+up+to+date.");

  const result = await retrySeatPlanSync(payment.reference);
  if (!result.ok) redirect(`/admin/billing?${new URLSearchParams({ error: result.reason })}`);
  revalidatePath("/admin");
  revalidatePath("/admin/billing");
  redirect(`/admin/billing?${new URLSearchParams({ msg: result.reason })}`);
}
