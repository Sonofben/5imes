import Link from "next/link";

type Step = { title: string; text: string; href: string; done: boolean | null; action: string };

/**
 * First thing a new workspace admin sees on /admin. Stays until the required
 * steps are done, so an admin always knows what to do next.
 */
export function SetupChecklist({ companyName, mfaOn, hasOffice, hasStaff, welcome }: {
  companyName: string; mfaOn: boolean; hasOffice: boolean; hasStaff: boolean; welcome: boolean;
}) {
  const steps: Step[] = [
    { title: "Turn on two-factor sign-in", text: "Admin tools need a code from an authenticator app, so a stolen password alone can’t open them.", href: "/admin/security?setup=1", done: mfaOn, action: "Set up" },
    { title: "Add your office", text: "Pin the office on the map. Staff can only check in within its radius.", href: "/admin/locations", done: hasOffice, action: "Add office" },
    { title: "Check the work week", text: "Monday–Friday in the office is set by default. Switch any day to home or off.", href: "/admin/schedule", done: null, action: "Review" },
    { title: "Invite your staff", text: "Add people by work email. They set a password from the invitation email.", href: "/admin/staff", done: hasStaff, action: "Invite" },
  ];
  const remaining = steps.filter((step) => step.done === false).length;
  if (!remaining && !welcome) return null;

  return (
    <section aria-labelledby="setup-heading" className="card space-y-4 p-5 sm:p-6">
      <div>
        <p className="eyebrow">{welcome ? "Workspace created" : "Finish setting up"}</p>
        <h2 id="setup-heading" className="mt-1 text-lg font-bold">
          {welcome ? `Welcome to ${companyName} on 5ime` : `${remaining} step${remaining === 1 ? "" : "s"} left before your team can check in`}
        </h2>
        <p className="mt-1 text-sm text-muted">This is your admin home. Work through these steps in order; you can come back here any time from “Today”.</p>
      </div>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
            <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? "bg-green-50 text-ok" : "bg-paper text-muted"}`}>{step.done ? "✓" : index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{step.title}{step.done && <span className="sr-only"> (done)</span>}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">{step.text}</p>
            </div>
            {!step.done && <Link href={step.href} className={index === steps.findIndex((s) => s.done === false) ? "btn-brand btn-sm shrink-0" : "btn-ghost btn-sm shrink-0"}>{step.action}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
