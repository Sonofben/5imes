import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitePage() {
  return <ResetPasswordForm mode="invite" />;
}
