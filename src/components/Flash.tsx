export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <div className="space-y-2">
      {msg && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-ok">{msg}</div>}
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-bad">{error}</div>}
    </div>
  );
}
