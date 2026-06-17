"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { AuthWordmark } from "@/components/brand/auth-wordmark";

function InviteEnterContent() {
  const searchParams = useSearchParams();
  const invite = searchParams.get("invite")?.trim() ?? "";
  const token = searchParams.get("token")?.trim() ?? "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = invite || token;
    if (!code) {
      setError("This invite link is missing a code. Use the link from your Fixfy email.");
      return;
    }
    const params = new URLSearchParams();
    if (invite) params.set("invite", invite);
    else params.set("token", token);
    window.location.replace(`/api/auth/invite/enter?${params.toString()}`);
  }, [invite, token]);

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
      {error ? (
        <>
          <p style={{ marginTop: 28, fontSize: 16, color: T.ink, maxWidth: 360, lineHeight: 1.5 }}>{error}</p>
          <a
            href="/login"
            style={{ marginTop: 20, fontSize: 15, fontWeight: 600, color: T.coral, textDecoration: "none" }}
          >
            Go to sign in
          </a>
        </>
      ) : (
        <>
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
          <p style={{ marginTop: 20, fontSize: 16, color: T.ink, fontWeight: 600 }}>Setting up your account…</p>
          <p style={{ marginTop: 8, fontSize: 14, color: T.mute, maxWidth: 280, lineHeight: 1.5 }}>
            This only takes a moment. Please don&apos;t close this page.
          </p>
          <style>{`@keyframes invite-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
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
      <InviteEnterContent />
    </Suspense>
  );
}
