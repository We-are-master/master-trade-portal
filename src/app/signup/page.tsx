"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { T } from "@/lib/tokens";
import { getPlan, parsePlanId, PARTNERS_LP_URL } from "@/lib/plan-catalog";
import { Button, Icon, Input } from "@/components/ui/primitives";
import { PlanSummaryCard } from "@/components/billing/plan-summary-card";
import { Wordmark } from "@/components/shell/sidebar";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = parsePlanId(searchParams.get("plan")) ?? null;
  const plan = planId ? getPlan(planId) : null;

  const [step, setStep] = useState<"details" | "code">("details");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

  const detailsValid = fullName.trim() && company.trim() && email.includes("@") && Boolean(planId);

  if (!planId) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: T.paper }}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <p style={{ fontSize: 16, color: T.ink, marginBottom: 16 }}>Choose your plan first, then create your account.</p>
          <Button variant="primary" onClick={() => { window.location.href = PARTNERS_LP_URL; }}>
            View plans
          </Button>
        </div>
      </div>
    );
  }

  const createAccount = async () => {
    setError(null);
    setDevNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          company: company.trim(),
          plan: planId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; devCode?: string; emailError?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      setStep("code");
      if (data.devCode) {
        setCode(data.devCode);
        setDevNote(`Dev: code is ${data.devCode}${data.emailError ? ` · email failed: ${data.emailError}` : ""}`);
      } else if (data.emailError) {
        setDevNote(`Email send failed: ${data.emailError}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create your account.");
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
      router.replace("/?welcome=1");
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
          if (step === "details" && detailsValid) createAccount();
          if (step === "code" && code.trim().length === 6) verify();
        }}
        style={{ width: 400, maxWidth: "100%", background: T.white, border: `1px solid ${T.line}`, borderRadius: 16, boxShadow: "0 24px 48px rgba(2,0,64,0.10)", overflow: "hidden" }}
      >
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <Wordmark height={22} />
          <span style={{ fontSize: 10, fontWeight: 500, color: T.mute, padding: "2px 6px", background: T.paper2, borderRadius: 4, letterSpacing: 0.4 }}>TRADE</span>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.navy, letterSpacing: -0.3 }}>
              {step === "details" ? `Join Fixfy · ${plan?.name}` : "Enter your code"}
            </div>
            <div style={{ fontSize: 13, color: T.mute, marginTop: 4, lineHeight: 1.5 }}>
              {step === "details" ? (
                <>You selected <strong>{plan?.priceLabel}</strong>. We&apos;ll set up your profile next — card required before approval, no charge until you&apos;re live.</>
              ) : (
                <>Sent to <b style={{ color: T.ink }}>{email}</b>. Check your inbox.</>
              )}
            </div>
          </div>

          {step === "details" ? (
            <>
              <Input value={fullName} onChange={setFullName} placeholder="Your full name" icon="user" autoFocus size="lg" />
              <Input value={company} onChange={setCompany} placeholder="Company / trading name" icon="briefcase" size="lg" />
              <Input value={email} onChange={setEmail} placeholder="you@example.com" icon="mail" type="email" size="lg" />
            </>
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

          {step === "details" ? (
            <Button variant="primary" size="lg" full icon="arrow-right" onClick={createAccount} disabled={busy || !detailsValid}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          ) : (
            <>
              <Button variant="primary" size="lg" full icon="check" onClick={verify} disabled={busy || code.trim().length < 6}>
                {busy ? "Verifying…" : "Start free trial"}
              </Button>
              <button
                onClick={() => { setStep("details"); setCode(""); setError(null); }}
                style={{ background: "transparent", border: "none", color: T.mute, fontSize: 12.5, fontFamily: T.sans, cursor: "pointer" }}
              >
                ← Edit my details
              </button>
            </>
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.line}`, background: T.paper, fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
          Already with Fixfy? <Link href="/login" style={{ color: T.coral, fontWeight: 500 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: T.paper }} />}>
      <SignupForm />
    </Suspense>
  );
}
