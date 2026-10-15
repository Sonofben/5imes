"use client";

import { Logo } from "@/components/Logo";

/** Shown instead of a blank screen when a page fails on the server. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md space-y-4 text-center">
        <Logo />
        <h1 className="text-lg font-bold">This page couldn’t load</h1>
        <p className="text-sm text-muted">
          Something went wrong on our side. Try again; if it keeps happening, sign out and back in, or contact 5ime support
          {error.digest ? <> with reference <code className="rounded bg-paper px-1">{error.digest}</code></> : null}.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">Try again</button>
          <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>
        </div>
      </div>
    </main>
  );
}
