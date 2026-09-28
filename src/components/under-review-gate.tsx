"use client";

// Shown instead of the portal while a new partner waits for approval in the OS
// (status still `onboarding`). They can't browse the platform yet: the card
// plays the "Working with Fixfy" explainer, and the portal opens by itself the
// moment the OS flips them to `active`. Anyone who skipped the documents step
// gets a strip here to upload what's missing.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { createClient } from "@/lib/supabase/client";
import { AuthWordmark } from "@/components/brand/auth-wordmark";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/primitives";
import { ExplainerVideo } from "@/components/explainer-video";
import { RequiredDocsList, useRequiredDocs } from "@/components/required-docs";

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

  const docs = useRequiredDocs();
  const docsMissing = docs.missingMandatory.length;
  const [docsOpen, setDocsOpen] = useState(false);

  // Phones get the 9:16 cut of the explainer, everything wider the 16:9 one.
  const phone = useMediaQuery("(max-width: 700px)");
  // Room the card takes besides the video: text, progress bar, missing-docs strip.
  const reserved = (phone ? 388 : 438) + (docsMissing > 0 ? 62 : 0);
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

          {docsMissing > 0 && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                marginBottom: 12,
                borderRadius: 12,
                background: T.coralTint,
                textAlign: "left",
              }}
            >
              <p style={{ margin: 0, flex: 1, fontSize: 13, lineHeight: 1.4, color: T.coralPress }}>
                <strong>
                  {docsMissing} document{docsMissing === 1 ? "" : "s"} still needed.
                </strong>{" "}
                We can approve you once they&apos;re in.
              </p>
              <Button variant="primary" size="sm" onClick={() => setDocsOpen(true)}>
                Upload
              </Button>
            </div>
          )}

          <ExplainerVideo
            key={video.src}
            src={video.src}
            poster={video.poster}
            ratio={video.ratio}
            width={
              phone
                ? // Whatever height is left on screen, never wider than the card.
                  `min(calc((100dvh - ${reserved}px) * 9 / 16), calc(100vw - 56px))`
                : `min(100%, calc((100dvh - ${reserved}px) * 16 / 9))`
            }
          />

          <p style={{ margin: "12px 0 0", fontSize: 12, color: T.mute, lineHeight: 1.45 }}>
            This page opens your portal by itself once your account is active.
          </p>
        </div>
      </main>

      {docsOpen && (
        <div
          onClick={() => setDocsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 960,
            background: "rgba(2,0,64,0.55)",
            display: "flex",
            alignItems: phone ? "flex-end" : "center",
            justifyContent: "center",
            padding: phone ? 0 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(600px, 100%)",
              maxHeight: phone ? "88dvh" : "85dvh",
              background: T.white,
              borderRadius: phone ? "20px 20px 0 0" : 20,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 20px 6px" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.navy }}>Your documents</h3>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: T.slate, lineHeight: 1.45 }}>
                PDF or photo, up to 10 MB each.{" "}
                {docsMissing > 0 ? `${docsMissing} still needed.` : "All in. Thanks!"}
              </p>
            </div>
            <div style={{ padding: "14px 20px 4px", overflowY: "auto", textAlign: "left" }}>
              <RequiredDocsList
                required={docs.required}
                loadError={docs.loadError}
                uploaded={docs.uploaded}
                onUploaded={docs.markUploaded}
              />
            </div>
            <div style={{ padding: "12px 20px 18px", borderTop: `1px solid ${T.line}` }}>
              <Button variant="primary" size="lg" full onClick={() => setDocsOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

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
