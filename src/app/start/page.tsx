import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

/** Post-sign-in router: links invites, auto-joins by domain, sends people to the right place. */
export default async function StartPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_organization");
  const res = (data ?? {}) as { status?: string; role?: string; domain?: string };

  if (!error) {
    if (res.status === "active") redirect(["owner", "admin", "manager"].includes(res.role!) ? "/admin" : "/app");
    if (res.status === "pending") redirect("/pending");
    if (res.status === "disabled") redirect("/pending?disabled=1");
    if (res.status === "no_org") redirect("/onboarding");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md space-y-4 text-center">
        <Logo />
        {res.status === "public_email" ? (
          <>
            <h1 className="text-lg font-bold">Use your company email</h1>
            <p className="text-sm text-muted">
              5ime only works with company email addresses (like you@yourcompany.com). Personal Gmail, Yahoo or
              Outlook accounts can’t be used.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-muted">{error?.message ?? "Please try signing in again."}</p>
          </>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn-primary">Sign in with a different account</button>
        </form>
      </div>
    </main>
  );
}
