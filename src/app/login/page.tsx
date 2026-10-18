import { LoginForm } from "@/components/LoginForm";
import { readFlash } from "@/lib/flash";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { msg, error } = readFlash(await searchParams);
  return <LoginForm initialError={error} initialNotice={msg} />;
}
