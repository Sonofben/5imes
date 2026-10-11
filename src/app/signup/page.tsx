import type { Metadata } from "next";
import { SignupForm } from "@/components/SignupForm";

export const metadata: Metadata = { title: "Create a 5ime workspace" };

export default function SignupPage() {
  return <SignupForm />;
}
