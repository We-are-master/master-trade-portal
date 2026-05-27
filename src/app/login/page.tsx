"use client";

// Partner login — email OTP delivered via Resend (see /api/auth/request-otp).
// The self-hosted Supabase has no GoTrue SMTP, so we generate the code server-side and
// email it ourselves, then verify it (which sets the session cookie).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { Button, Icon, Input } from "@/components/ui/primitives";
import { Wordmark } from "@/components/shell/sidebar";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    setDevNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        devCode?: string;
        emailError?: string;
        genError?: string;
        notPartner?: boolean;
      };
      if (!res.ok) throw new Error("Couldn't send the code. Try again.");
      setStep("code");
      // Dev: prefill the code and surface why the email may not have arrived.
      if (data.notPartner) {
        setDevNote("This email isn't a registered partner (no partners row / external_partner). No code sent.");
      } else if (data.devCode) {
        setCode(data.devCode);
        setDevNote(
          `Dev: code is ${data.devCode}` +
            (data.emailError ? ` · email failed: ${data.emailError}` : "") +
            (data.genError ? ` · ${data.genError}` : ""),
        );
      } else if (data.emailError) {
        setDevNote(`Email send failed: ${data.emailError}`);
      } else if (data.genError) {
        setDevNote(`Auth: ${data.genError}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work.");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.paper, padding: 24 }}>
      <div
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (step === "email" && email.trim()) sendCode();
          if (step === "code" && code.trim().length === 6) verify();
        }}
        style={{ width: 380, maxWidth: "100%", background: T.white, border: `1px solid ${T.line}`, borderRadius: 16, boxShadow: "0 24px 48px rgba(2,0,64,0.10)", overflow: "hidden" }}
      >
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <Wordmark height={22} />
          <span style={{ fontSize: 10, fontWeight: 500, color: T.mute, padding: "2px 6px", background: T.paper2, borderRadius: 4, letterSpacing: 0.4 }}>TRADE</span>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.navy, letterSpacing: -0.3 }}>
              {step === "email" ? "Sign in" : "Enter your code"}
            </div>
            <div style={{ fontSize: 13, color: T.mute, marginTop: 4, lineHeight: 1.5 }}>
              {step === "email" ? "We'll email you a 6-digit sign-in code." : <>Sent to <b style={{ color: T.ink }}>{email}</b>. Check your inbox.</>}
            </div>
          </div>

          {step === "email" ? (
            <Input value={email} onChange={setEmail} placeholder="you@example.com" icon="mail" type="email" autoFocus size="lg" />
          ) : (
            <Input value={code} onChange={setCode} placeholder="6-digit code" icon="lock" autoFocus size="lg" />
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.red, background: T.red50, borderRadius: 8, padding: "8px 10px" }}>
              <Icon name="alert-triangle" size={14} />
              <span>{error}</span>
            </div>
          )}

          {devNote && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: T.amber, background: T.amber50, borderRadius: 8, padding: "8px 10px", lineHeight: 1.4 }}>
              <Icon name="info" size={14} />
              <span>{devNote}</span>
            </div>
          )}

          {step === "email" ? (
            <Button variant="primary" size="lg" full icon="arrow-right" onClick={sendCode} disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <>
              <Button variant="primary" size="lg" full icon="check" onClick={verify} disabled={busy || code.trim().length < 6}>
                {busy ? "Verifying…" : "Sign in"}
              </Button>
              <button
                onClick={() => { setStep("email"); setCode(""); setError(null); }}
                style={{ background: "transparent", border: "none", color: T.mute, fontSize: 12.5, fontFamily: T.sans, cursor: "pointer" }}
              >
                ← Use a different email
              </button>
            </>
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.line}`, background: T.paper, fontSize: 11.5, color: T.mute, lineHeight: 1.5 }}>
          Trades only. Your account is created during onboarding with Fixfy.
        </div>
      </div>
    </div>
  );
}
