import { PLANS, naira, type PlanId } from "@/lib/constants";

/** Shown when bank-transfer details are configured on the server (.env). */
export function BankTransferCard({ seats, domain, plan }: { seats: number; domain: string; plan?: PlanId }) {
  const accountNumber = process.env.BANK_TRANSFER_ACCOUNT_NUMBER?.trim();
  if (!accountNumber) return null;
  const bank = process.env.BANK_TRANSFER_BANK?.trim() ?? "";
  const accountName = process.env.BANK_TRANSFER_ACCOUNT_NAME?.trim() ?? "";
  const contact = process.env.BANK_TRANSFER_CONTACT?.trim() ?? "";
  const plans = plan ? [PLANS[plan]] : Object.values(PLANS);
  const reference = `5IME-${domain.toUpperCase()}`;
  return (
    <section className="card space-y-4">
      <div>
        <p className="eyebrow">Pay by bank transfer</p>
        <h2 className="mt-1 text-lg font-bold">Prefer a direct transfer?</h2>
        <p className="mt-1 text-sm text-muted">Transfer the exact amount for your plan, seats and term. We activate your term once the money arrives — usually the same working day. Nothing is charged automatically.</p>
      </div>
      <div className="grid gap-3 rounded-xl bg-paper p-4 text-sm sm:grid-cols-3">
        <div><p className="label">Bank</p><p className="font-semibold">{bank}</p></div>
        <div><p className="label">Account number</p><p className="font-mono font-semibold tabular-nums">{accountNumber}</p></div>
        <div><p className="label">Account name</p><p className="font-semibold">{accountName}</p></div>
        <div className="sm:col-span-3"><p className="label">Transfer narration / reference</p><p className="font-mono font-semibold">{reference}</p></div>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Plan</th><th>1 month</th><th>3 months</th><th>6 months</th><th>12 months</th></tr></thead>
          <tbody>{plans.map((p) => (
            <tr key={p.id}><td className="font-medium">{p.name} · {seats} seat{seats === 1 ? "" : "s"}</td>
              {[1, 3, 6, 12].map((m) => <td key={m} className="tabular-nums">{naira(p.pricePerSeat * seats * m)}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">After paying, send the transfer receipt{contact ? ` to ${contact}` : ""} with your company email domain (@{domain}), plan, seats and number of months. Adding seats mid-term: each extra seat is {plans.map((p) => `${naira(p.pricePerSeat)}`).join(" / ")} per month × the months in your current term.</p>
    </section>
  );
}
