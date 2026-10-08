import { Logo } from "@/components/Logo";

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
  const { disabled } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md space-y-4 text-center">
        <Logo />
        <h1 className="text-lg font-bold">{disabled ? "Your access is switched off" : "Waiting for approval"}</h1>
        <p className="text-sm text-muted">
          {disabled
            ? "Your company admin has disabled your 5ime account. Contact them if this is a mistake."
            : "Your company is on 5ime. An admin needs to approve you before you can check in — we’ve let them know. Refresh this page once they have."}
        </p>
        <div className="flex justify-center gap-2">
          <a href="/start" className="btn-ghost">Refresh</a>
          <form action="/auth/signout" method="post">
            <button className="btn-ghost">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
