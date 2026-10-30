import Link from "next/link";

/**
 * Shown in place of a feature the company's plan doesn't include. Admins get the upgrade button;
 * everyone else is told to ask an admin. The database refuses the feature too; this is only the message.
 */
export function PlanLock({ title, plan, points, isAdmin, compact = false }: {
  title: string; plan: "Pro" | "Premium"; points?: string[]; isAdmin: boolean; compact?: boolean;
}) {
  return (
    <section className={`card space-y-3 ${compact ? "" : "max-w-2xl"}`}>
      <span className="chip bg-[#fbf4e3] text-[#7a5a0e]">{plan} plan</span>
      <h2 className="text-lg font-bold">{title}</h2>
      {points && points.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{points.map((p) => <li key={p}>{p}</li>)}</ul>}
      {isAdmin
        ? <Link href={`/admin/billing?plan=${plan.toLowerCase()}`} className="btn-primary inline-flex">Upgrade to {plan}</Link>
        : <p className="text-sm text-muted">Ask an admin to upgrade under Billing.</p>}
    </section>
  );
}
