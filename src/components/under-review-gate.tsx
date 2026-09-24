"use client";

// Shown instead of the portal while a new partner waits for approval in the OS
// (status still `onboarding`). They can't browse the platform yet: the card
// plays the "Working with Fixfy" explainer, and the portal opens by itself the
// moment the OS flips them to `active`.

import { useEffect } from "react";
import { T } from "@/lib/tokens";
import { createClient } from "@/lib/supabase/client";
import { AuthWordmark } from "@/components/brand/auth-wordmark";
import { useMediaQuery } from "@/hooks/use-media-query";

const POLL_MS = 60_000;

export function UnderReviewGate({ partnerId }: { partnerId: string }) {
  // No realtime channel for partners, so check the status every minute and
  // whenever they come back to the tab; reload into the full portal once active.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await createClient().from("partners").select("status").eq("id", partnerId).maybeSingle();
      if (alive && (data as { status?: string } | null)?.status === "active") window.location.reload();
    };
    const timer = setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [partnerId]);

  // Phones get the 9:16 cut of the explainer, everything wider the 16:9 one.
  const phone = useMediaQuery("(max-width: 700px)");
  const video = phone
    ? { src: "/videos/working-with-fixfy-vertical.mp4", poster: "/videos/working-with-fixfy-vertical.jpg", ratio: "9 / 16" }
    : { src: "/videos/working-with-fixfy.mp4", poster: "/videos/working-with-fixfy.jpg", ratio: "16 / 9" };

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        background: `radial-gradient(1200px 600px at 50% -10%, rgba(237,75,0,0.18), transparent 60%), ${T.navy}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 950,
        fontFamily: T.sans,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: phone ? 10 : 16,
          padding: phone ? "14px" : "16px 24px",
          flexShrink: 0,
        }}
      >
        <AuthWordmark light size={phone ? 17 : 20} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: T.mono,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: T.coral,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
          Under review
        </span>
        <button
          type="button"
          onClick={signOut}
          style={{
            marginLeft: "auto",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.72)",
            fontFamily: T.sans,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: phone ? "0 12px" : "0 24px" }}>
        <div
          style={{
            width: "min(640px, 100%)",
            maxHeight: "100%",
            background: T.white,
            borderRadius: 20,
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
            padding: phone ? "20px 16px 16px" : "28px 28px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {!phone && (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: T.coralTint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                fontSize: 24,
                flexShrink: 0,
              }}
              aria-hidden
            >
              🎉
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: phone ? 20 : 22, fontWeight: 700, color: T.navy, letterSpacing: "-0.02em" }}>
            Application Submitted
          </h2>
          <p style={{ margin: "10px auto 0", maxWidth: 480, fontSize: phone ? 13 : 14, color: T.slate, lineHeight: 1.5 }}>
            Thanks, we&apos;re reviewing your onboarding now. New accounts are usually approved within 24 to 48
            hours, and we&apos;ll email you the moment you&apos;re live.
          </p>
          <p style={{ margin: "10px auto 14px", maxWidth: 480, fontSize: phone ? 13 : 14, fontWeight: 600, color: T.navy, lineHeight: 1.5 }}>
            While you wait, here&apos;s how working with Fixfy works.
          </p>

          <video
            key={video.src}
            src={video.src}
            poster={video.poster}
            controls
            autoPlay
            muted
            playsInline
            preload="metadata"
            style={
              phone
                ? {
                    // Whatever height is left on screen, never wider than the card.
                    height: "min(calc(100dvh - 370px), calc((100vw - 56px) * 16 / 9))",
                    width: "auto",
                    aspectRatio: "9 / 16",
                    display: "block",
                    borderRadius: 12,
                    background: T.navy,
                  }
                : {
                    width: "min(100%, calc((100dvh - 420px) * 16 / 9))",
                    height: "auto",
                    aspectRatio: "16 / 9",
                    display: "block",
                    borderRadius: 12,
                    background: T.navy,
                  }
            }
          />

          <p style={{ margin: "12px 0 0", fontSize: 12, color: T.mute, lineHeight: 1.45 }}>
            This page opens your portal by itself once your account is active.
          </p>
        </div>
      </main>

      <footer
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: phone ? "12px 14px" : "14px 24px",
          fontFamily: T.mono,
          fontSize: 11,
          letterSpacing: "0.04em",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        <span>© 2026 Fixfy · partners.getfixfy.com</span>
        <a href="mailto:support@getfixfy.com" style={{ color: "rgba(255,255,255,0.8)" }}>
          Contact support
        </a>
      </footer>
    </div>
  );
}
