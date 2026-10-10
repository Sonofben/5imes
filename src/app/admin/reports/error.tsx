"use client";

export default function ReportsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="card border-red-200 bg-red-50"><p className="eyebrow text-bad">Report unavailable</p><h1 className="mt-1 text-lg font-bold">No partial report was shown</h1><p className="mt-1 text-sm leading-6 text-muted">The attendance data could not be read completely. Check your connection or access, then try again.</p><button className="btn-primary mt-4" onClick={() => reset()}>Try again</button></section>;
}
