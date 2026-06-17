"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthBrandToggle } from "@/components/auth/auth-brand-toggle";

function LoginForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";
  const invite = searchParams.get("invite")?.trim() ?? "";
  const inviteError = searchParams.get("invite_error") === "1";
  return <AuthBrandToggle initialEmail={email} initialInviteCode={invite} initialInviteError={inviteError} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthBrandToggle />}>
      <LoginForm />
    </Suspense>
  );
}
