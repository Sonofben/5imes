import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { TRIAL_DAYS } from "@/lib/constants";

async function createCompany(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/locations?welcome=1");
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const domain = user?.email?.split("@")[1];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo />
        </div>
        <form action={createCompany} className="card space-y-5">
          <div>
            <h1 className="text-xl font-bold">Set up your company</h1>
            <p className="mt-1 text-sm text-muted">
              Anyone signing in with an <b>@{domain}</b> email will be able to request access. You stay in control —
              you approve every person.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="name">Company name</label>
            <input id="name" name="name" className="input" required minLength={2} placeholder="Acme Nigeria Ltd" />
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn-brand w-full">Start {TRIAL_DAYS}-day free trial</button>
          <p className="text-center text-xs text-muted">No card needed. Full Pro features during the trial.</p>
        </form>
      </div>
    </main>
  );
}
