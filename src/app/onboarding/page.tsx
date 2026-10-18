import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { loadPlans } from "@/lib/plans";
import { suggestWorkspaceName } from "@/lib/workspace";

async function createCompany(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  // The workspace owner always lands on the admin home, which shows the setup checklist.
  redirect("/admin?welcome=1");
}

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If the user already belongs to a company (or is pending approval), the
  // post-signin dispatcher knows where to send them. Bouncing through /start
  // avoids showing an onboarding form that will reject their submission.
  const { data: existingMember } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingMember) redirect("/start");

  const { trialDays: TRIAL_DAYS } = await loadPlans(supabase);
  const domain = user.email?.split("@")[1] ?? "";
  const suggested = String(user.user_metadata?.company_name ?? "").trim() || suggestWorkspaceName(domain);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo />
        </div>
        <form action={createCompany} className="card space-y-5">
          <div>
            <p className="eyebrow">Step 2 of 2</p>
            <h1 className="mt-1 text-xl font-bold">Confirm your workspace</h1>
            <p className="mt-1 text-sm text-muted">
              This workspace is for everyone with an <b>@{domain}</b> email. You’ll be its admin, and you approve
              every person who joins.
            </p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-paper px-4 py-3 text-sm">
            <dt className="text-muted">Company email</dt><dd className="font-medium">@{domain}</dd>
            <dt className="text-muted">Your role</dt><dd className="font-medium">Workspace admin (owner)</dd>
            <dt className="text-muted">Plan</dt><dd className="font-medium">{TRIAL_DAYS}-day Pro trial, no card</dd>
          </dl>
          <div>
            <label className="label" htmlFor="name">Workspace name</label>
            <input id="name" name="name" className="input" required minLength={2} maxLength={80} defaultValue={suggested} />
            <p className="mt-1 text-xs text-muted">We filled this in from your email. Correct it if it isn’t your company’s name; staff will see it.</p>
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <button className="btn-brand w-full">Confirm and start my {TRIAL_DAYS}-day trial</button>
        </form>
      </div>
    </main>
  );
}
