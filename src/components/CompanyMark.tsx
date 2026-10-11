import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Company logo (or name) with a small "5ime" mark — used in the staff and admin portals. */
export function CompanyMark({ name, logoUrl, href }: { name: string; logoUrl: string | null; href: string }) {
  if (!logoUrl) return <Logo href={href} />;
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2">
      <img src={logoUrl} alt={`${name} logo`} className="h-9 w-auto max-w-[140px] object-contain" />
      <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted sm:inline">on 5ime</span>
    </Link>
  );
}
