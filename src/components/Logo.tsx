import Link from "next/link";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} aria-label="5ime home" className="inline-flex items-baseline text-2xl font-extrabold tracking-tight">
      <span className="text-brand">5</span>
      <span className={light ? "text-white" : "text-ink"}>ime</span>
    </Link>
  );
}
