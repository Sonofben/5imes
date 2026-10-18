import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { lookup } from "@/lib/schemas";

type Ann = { id: string | null; message: string; level: "info" | "warning" | "critical"; maintenance: boolean };
const TONE: Record<Ann["level"], string> = {
  info: "border-[#c9d9e8] bg-[#f2f7fb] text-[#1f4b6e]",
  warning: "border-[#ead8c0] bg-[#fff9ef] text-warn",
  critical: "border-red-200 bg-red-50 text-bad",
};

/** Platform-wide messages from Global Admin (announcements and maintenance). */
export async function AnnouncementBanner({ supabase }: { supabase: SupabaseClient<Database> }) {
  const { data } = await supabase.rpc("my_announcements");
  const items = (data ?? []);
  if (!items.length) return null;
  return (
    <div className="my-3 space-y-2">
      {items.map((a, i) => (
        <p key={a.id ?? `m${i}`} role={a.level === "info" ? "status" : "alert"} className={`rounded-2xl border px-4 py-3 text-sm ${lookup(TONE, a.level, TONE.info)}`}>
          {a.maintenance && <b>Maintenance: </b>}{a.message}
        </p>
      ))}
    </div>
  );
}
