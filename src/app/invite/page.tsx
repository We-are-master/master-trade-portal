"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { AuthWordmark } from "@/components/brand/auth-wordmark";

/** Legacy OS links (/invite?invite=…) — forward to /get-started with the same params. */
function InviteRedirectContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const invite = params.get("invite")?.trim() || params.get("token")?.trim();
    if (invite && !params.get("invite")) params.set("invite", invite);
    params.delete("token");
    window.location.replace(`/get-started?${params.toString()}`);
  }, [searchParams]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))",
        background: T.paper,
        textAlign: "center",
      }}
    >
      <AuthWordmark size={28} />
      <div
        style={{
          marginTop: 32,
          width: 36,
          height: 36,
          border: `3px solid ${T.line}`,
          borderTopColor: T.coral,
          borderRadius: "50%",
          animation: "invite-spin 0.8s linear infinite",
        }}
      />
      <p style={{ marginTop: 20, fontSize: 16, color: T.ink, fontWeight: 600 }}>Opening onboarding…</p>
      <style>{`@keyframes invite-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: T.paper }}>
          <p style={{ fontSize: 16, color: T.mute }}>Loading…</p>
        </div>
      }
    >
      <InviteRedirectContent />
    </Suspense>
  );
}
