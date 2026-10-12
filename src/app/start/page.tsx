import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

type Destination = { destination: string; reason: string | null };

/**
 * Post-sign-in router. The trusted mapping lives in SQL
 * (`public.post_auth_destination()`); here we just read it, apply the
 * side-effect of auto-joining the member's company on first sign-in, and
 * redirect. Keeping the decision in the DB means a client cannot flip their
 * destination by editing cookies or user_metadata.
 */
export default async function StartPage() {
  const supabase = await createClient();

  // Side effect first: on first sign-in, link an invitation or auto-join by
  // company domain so a member row exists for us to route by. join_organization
  // never promotes a user and is idempotent — it's safe to call on every visit.
  const { error: joinError } = await supabase.rpc("join_organization");

  const { data, error } = await supabase.rpc("post_auth_destination");
  const row = Array.isArray(data) ? (data[0] as Destination | undefined) : (data as Destination | undefined);

  if (!error && row?.destination && row.destination !== "/start") {
    redirect(row.destination);
  }

  const message = row?.reason ?? joinError?.message ?? error?.message ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md space-y-4 text-center">
        <Logo />
        {message === "public_email" ? (
          <>
            <h1 className="text-lg font-bold">Use your company email</h1>
            <p className="text-sm text-muted">
              5ime only works with company email addresses (like you@yourcompany.com). Personal Gmail, Yahoo or
              Outlook accounts can&apos;t be used.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-muted">{message ?? "Please try signing in again."}</p>
          </>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn-primary">Sign in with a different account</button>
        </form>
      </div>
    </main>
  );
}
