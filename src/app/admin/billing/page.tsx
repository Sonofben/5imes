import { requireMember, type Subscription } from "@/lib/session";
import { PLANS, naira } from "@/lib/constants";
import { paystackEnabled } from "@/lib/paystack";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle<Subscription>(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", org.id).in("status", ["active", "invited"]),
  ]);
  const seats = Math.max(1, count ?? 1);
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "—");

  const statusText =
    sub?.status === "trialing"
      ? `Free trial (Pro features) until ${fmt(sub.trial_ends_at)}`
      : sub?.status === "active"
        ? `${PLANS[sub.plan].name} — paid until ${fmt(sub.current_period_end)}`
        : sub?.status ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted">Priced per person, per month. Pay monthly in naira with card, bank transfer or USSD.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Current plan</div>
          <div className="font-bold">{statusText}</div>
        </div>
        <div className="text-right">
          <div className="label">People on 5ime</div>
          <div className="font-bold">{seats}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(PLANS).map((p) => (
          <form key={p.id} action="/api/paystack/initialize" method="post" className={`card space-y-4 ${p.id === "pro" ? "border-ink" : ""}`}>
            <input type="hidden" name="plan" value={p.id} />
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">{p.name}</h2>
              <div>
                <span className="text-2xl font-extrabold">{naira(p.pricePerSeat)}</span>
                <span className="text-sm text-muted"> /person/month</span>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {p.features.map((f) => <li key={f}>✓ {f}</li>)}
            </ul>
            <div className="rounded-xl bg-paper p-3 text-sm">
              {seats} × {naira(p.pricePerSeat)} = <b>{naira(seats * p.pricePerSeat)}</b> for 30 days
            </div>
            <button className={p.id === "pro" ? "btn-brand w-full" : "btn-primary w-full"}>
              {sub?.status === "active" && sub.plan === p.id ? "Renew" : "Choose"} {p.name}
            </button>
          </form>
        ))}
      </div>
      {!paystackEnabled() && (
        <p className="text-xs text-muted">Demo mode: online payment isn’t connected yet on this server.</p>
      )}
    </div>
  );
}
