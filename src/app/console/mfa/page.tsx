import { requireConsole } from "@/lib/console";
import { MfaForm } from "./MfaForm";

export const dynamic = "force-dynamic";

export default async function ConsoleMfaPage() {
  await requireConsole({ allowAal1: true });
  return <MfaForm />;
}
