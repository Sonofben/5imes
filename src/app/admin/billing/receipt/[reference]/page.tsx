import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { ReceiptPrintButton } from "./ReceiptPrintButton";

export const dynamic = "force-dynamic";

type Payment = {
  reference: string;
  plan: "basic" | "pro";
  seats: number;
  billing_interval_months: number;
  amount_kobo: number | string;
  currency: string;
  status: string;
  kind: "subscription" | "seat_increase";
  created_at: string;
  applied_at: string | null;
};

function money(kobo: number | string, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(kobo) / 100);
}
function term(months: number) {
  return months === 1 ? "Monthly" : months === 3 ? "Every 3 months" : months === 6 ? "Every 6 months" : months === 12 ? "Yearly" : `${months} months`;
}

export default async function PaymentReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { org } = await requireMember({ admin: true });
  const admin = createAdminClient();
  if (!admin) redirect("/admin/billing?error=Payment+history+is+not+available.");
  const { data, error } = await admin.from("payments")
    .select("reference,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,created_at,applied_at")
    .eq("org_id", org.id).eq("reference", reference).eq("status", "applied").maybeSingle<Payment>();
  if (error || !data) notFound();
  const paymentDate = data.applied_at ?? data.created_at;
  const dateLabel = new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, dateStyle: "long", timeStyle: "short" }).format(new Date(paymentDate));
  const description = data.kind === "seat_increase" ? "Prorated increase in paid seat capacity" : `${data.plan.toUpperCase()} subscription · ${term(data.billing_interval_months)}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/admin/billing" className="btn-ghost btn-sm">Back to billing</Link><ReceiptPrintButton /></div>
      <article className="receipt-sheet rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6"><div><p className="eyebrow">5ime payment receipt</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Payment received</h1><p className="mt-2 text-sm text-muted">Issued to {org.name} · @{org.domain}</p></div><span className="chip bg-green-50 text-ok">Paid</span></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><div><p className="eyebrow">Receipt reference</p><p className="mt-1 break-all font-mono text-sm">{data.reference}</p></div><div><p className="eyebrow">Payment date</p><p className="mt-1 text-sm">{dateLabel}</p></div></div>
        <div className="mt-8 overflow-hidden rounded-xl border border-line"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line bg-[#fafbf9] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted"><span>Description</span><span>Amount</span></div><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-4 py-5"><div><p className="font-semibold">{description}</p><p className="mt-1 text-sm text-muted">{data.kind === "seat_increase" ? `New paid seat capacity: ${data.seats}` : `${data.seats} paid seat${data.seats === 1 ? "" : "s"}`}</p></div><p className="font-bold tabular-nums">{money(data.amount_kobo, data.currency)}</p></div><div className="flex justify-between border-t border-line bg-paper px-4 py-4 font-bold"><span>Total paid</span><span className="tabular-nums">{money(data.amount_kobo, data.currency)}</span></div></div>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div><p className="eyebrow">Payment type</p><p className="mt-1">{data.kind === "seat_increase" ? "Prorated seat increase" : "Subscription payment"}</p></div><div><p className="eyebrow">Billing period</p><p className="mt-1">{term(data.billing_interval_months)}</p></div></div>
        <p className="mt-8 border-t border-line pt-4 text-xs leading-5 text-muted">This receipt is generated from the 5ime payment record. It confirms the payment recorded for this organization and is not a tax invoice or a receipt issued by the payment provider.</p>
      </article>
    </main>
  );
}
