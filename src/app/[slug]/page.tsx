import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Old company links (5imes.click/<link>) move to /c/<link>. Old links keep working forever. */
export default async function OldCompanyLink({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_company_link", { p_slug: slug });
  if (!data) notFound();
  permanentRedirect(`/c/${data}`);
}
