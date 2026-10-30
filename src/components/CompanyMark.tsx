import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Company logo (or 5ime's, when there is none) for the staff and admin portals. The logo sits in a
 * small white badge so any logo — even a solid coloured rectangle — reads well on light and
 * brand-coloured headers without taking over the screen.
 */
export function CompanyMark({ name, logoUrl, href, onBrand = false }: { name: string; logoUrl: string | null; href: string; onBrand?: boolean }) {
  if (!logoUrl) return onBrand ? <Link href={href} className="text-lg font-extrabold">{name}</Link> : <Logo href={href} />;
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2">
      <span className="flex h-10 items-center rounded-xl border border-black/5 bg-white px-2 py-1 shadow-sm">
        <img src={logoUrl} alt={`${name} logo`} className="h-7 w-auto max-w-[120px] object-contain" />
      </span>
    </Link>
  );
}
