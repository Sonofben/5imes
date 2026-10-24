import Link from "next/link";

/**
 * Switch between the two modules of 5imes: Attendance (check-ins, people, schedules) and Visitors
 * (reception desk, invitations, visitor records). Shown in the header of both.
 */
export function ModuleSwitch({ current, attendanceHref, showVisitors = true }: { current: "attendance" | "visitors"; attendanceHref: string; showVisitors?: boolean }) {
  const item = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`;
  return (
    <nav aria-label="Modules" className="flex rounded-xl bg-paper p-1">
      <Link href={attendanceHref} aria-current={current === "attendance" ? "page" : undefined} className={item(current === "attendance")}>Attendance</Link>
      {showVisitors && <Link href="/visitors" aria-current={current === "visitors" ? "page" : undefined} className={item(current === "visitors")}>Visitors</Link>}
    </nav>
  );
}
