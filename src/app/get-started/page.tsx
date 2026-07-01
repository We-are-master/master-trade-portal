"use client";

// Partner acquisition funnel — account-first onboarding that collects everything the OS
// marks mandatory before dropping the trade into the portal on a free trial:
//   1. Trades        → determines which trade certificates are mandatory
//   2. Business type  → sole trader (UTR) vs limited company (proof of company)
//   3. Account        → create account + verify email (6-digit OTP), starts the trial
//   4. Documents      → upload every mandatory doc (dynamic checklist from /required-docs)
// Finishing hands the (now signed-in, trialing) partner straight into the portal at "/".
//
// Design: light "paper" canvas, coral accent, navy ink — matching the in-app onboarding
// wizard (src/components/screens/onboarding.tsx) so the whole partner journey feels like
// one product.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";
import { DEFAULT_PLAN_ID, getPlan, PARTNERS_LP_URL } from "@/lib/plan-catalog";

// ---------- Static content ----------
const TRADES = [
  { id: "Handyman", emoji: "🔧" },
  { id: "Plumber", emoji: "🔩" },
  { id: "Electrician", emoji: "⚡" },
  { id: "Painter", emoji: "🎨" },
  { id: "Carpenter", emoji: "🪚" },
  { id: "Compliance", emoji: "✅" },
] as const;

type LegalType = "self_employed" | "limited_company";

const TOTAL_STEPS = 4;

type RequiredDoc = {
  id: string;
  docType: string;
  name: string;
  description: string;
  group: "core" | "legal" | "trade_cert";
};

const GROUP_LABELS: Record<RequiredDoc["group"], string> = {
  core: "Identity & compliance",
  legal: "Business proof",
  trade_cert: "Trade certificates",
};

export default function GetStartedPage() {
  return (
    <Suspense fallback={null}>
      <GetStartedFunnel />
    </Suspense>
  );
}

function GetStartedFunnel() {
  // Prefill from the getfixfy.com/network/start handoff (trades/name/business/email).
  const sp = useSearchParams();
  const initialTrades = useMemo(() => {
    const wanted = (sp.get("trades") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const matched = TRADES.filter((t) => wanted.includes(t.id.toLowerCase())).map((t) => t.id);
    return new Set<string>(matched.length ? matched : ["Handyman"]);
  }, [sp]);

  const [step, setStep] = useState(0);

  // Collected answers
  const [trades, setTrades] = useState<Set<string>>(initialTrades);
  const [legalType, setLegalType] = useState<LegalType | null>(null);
  const [regNumber, setRegNumber] = useState("");

  // Account (prefilled from the handoff params when present)
  const [fullName, setFullName] = useState(sp.get("name")?.trim() ?? "");
  const [company, setCompany] = useState(sp.get("business")?.trim() ?? "");
  const [email, setEmail] = useState(sp.get("email")?.trim() ?? "");
  const [otp, setOtp] = useState("");
  const [accountPhase, setAccountPhase] = useState<"details" | "code">("details");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = getPlan(DEFAULT_PLAN_ID);

  const toggleTrade = (id: string) =>
    setTrades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const regLabel = legalType === "limited_company" ? "Company number (CRN)" : "UTR (Unique Taxpayer Reference)";
  const detailsValid = fullName.trim() && company.trim() && email.includes("@");

  const goBack = () => {
    setError(null);
    if (step === 2 && accountPhase === "code") {
      setAccountPhase("details");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const exit = () => {
    window.location.href = PARTNERS_LP_URL;
  };

  // --- Step 2 → create account, email OTP ---
  const createAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), company: company.trim(), plan: DEFAULT_PLAN_ID }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; devCode?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      setDevCode(data.devCode ?? null);
      if (data.devCode) setOtp(data.devCode); // dev-only convenience: no email delivery locally
      setAccountPhase("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create your account.");
    } finally {
      setBusy(false);
    }
  };

  // --- Step 2 → verify OTP, save profile, advance to documents ---
  const verifyAndContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: otp.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work.");

      const profRes = await fetch("/api/partner/onboarding-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trades: [...trades],
          primaryTrade: [...trades][0],
          legalType,
          regNumber: regNumber.trim(),
        }),
      });
      const prof = (await profRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!profRes.ok || !prof.ok) throw new Error(prof.error || "Couldn't save your details.");

      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (step === 0) {
      if (trades.size === 0) return;
      setStep(1);
    } else if (step === 1) {
      if (!legalType || !regNumber.trim()) return;
      setStep(2);
    } else if (step === 2) {
      if (accountPhase === "details") {
        if (detailsValid) void createAccount();
      } else if (otp.trim().length === 6) {
        void verifyAndContinue();
      }
    }
  };

  const primaryLabel = (() => {
    if (step === 0) return "Continue";
    if (step === 1) return "Continue";
    if (step === 2) return accountPhase === "details" ? "Send my code" : "Verify & continue";
    return "";
  })();

  const primaryDisabled = (() => {
    if (busy) return true;
    if (step === 0) return trades.size === 0;
    if (step === 1) return !legalType || !regNumber.trim();
    if (step === 2) return accountPhase === "details" ? !detailsValid : otp.trim().length !== 6;
    return false;
  })();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: T.sans,
        color: T.ink,
        background:
          "radial-gradient(1100px 700px at 50% -220px, rgba(237,75,0,0.10), transparent 60%), linear-gradient(180deg, #F4F2F0 0%, #F7F7FB 48%, #EEEFF4 100%)",
      }}
    >
      {/* faint navy grid, masked toward the top like the onboarding backdrop */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(2,0,64,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(2,0,64,0.022) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
          maskImage: "radial-gradient(120% 80% at 50% 0%, #000 30%, transparent 90%)",
          WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 30%, transparent 90%)",
        }}
      />

      {/* Top bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "16px 24px",
          borderBottom: `1px solid ${T.line}`,
          background: "rgba(247,247,251,0.82)",
          backdropFilter: "blur(10px)",
        }}
      >
        <FunnelWordmark />
        <div style={{ flex: 1, maxWidth: 520, height: 6, borderRadius: 9999, background: T.paper2, overflow: "hidden" }}>
          <div
            style={{
              width: `${((step + 1) / TOTAL_STEPS) * 100}%`,
              height: "100%",
              borderRadius: 9999,
              background: T.coral,
              transition: `width 300ms ${T.ease}`,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
          <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5, letterSpacing: "0.04em" }}>
            Step {step + 1} of {TOTAL_STEPS}
          </span>
          <button
            type="button"
            onClick={exit}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: T.slate, fontFamily: T.sans, fontSize: 13, cursor: "pointer" }}
          >
            Exit <Icon name="x" size={14} />
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", justifyContent: "center", padding: "48px 24px 170px" }}>
        <div style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
          <StepDots step={step} total={TOTAL_STEPS} />

          {step === 0 && (
            <StepShell
              eyebrow="Step 1 · Pick your trades"
              title="What work do you do?"
              subtitle="Select every trade you cover — we match you with the right jobs."
              status={`${trades.size} trade${trades.size === 1 ? "" : "s"} selected`}
            >
              <CardGrid>
                {TRADES.map((tr) => (
                  <SelectCard key={tr.id} selected={trades.has(tr.id)} multi onClick={() => toggleTrade(tr.id)}>
                    <span style={{ fontSize: 30, lineHeight: 1 }}>{tr.emoji}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{tr.id}</span>
                  </SelectCard>
                ))}
              </CardGrid>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              eyebrow="Step 2 · Your business"
              title="How do you trade?"
              subtitle="This sets which tax and compliance documents you'll need to go live."
            >
              <CardGrid cols={2}>
                <SelectCard selected={legalType === "self_employed"} onClick={() => setLegalType("self_employed")} align="start">
                  <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Sole trader</span>
                  <span style={{ fontSize: 13, color: T.mute }}>Self-employed · you'll provide your UTR</span>
                </SelectCard>
                <SelectCard selected={legalType === "limited_company"} onClick={() => setLegalType("limited_company")} align="start">
                  <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Limited company</span>
                  <span style={{ fontSize: 13, color: T.mute }}>Registered at Companies House</span>
                </SelectCard>
              </CardGrid>
              {legalType && (
                <div style={{ maxWidth: 380, margin: "22px auto 0", textAlign: "left" }}>
                  <LightField label={regLabel}>
                    <LightInput
                      value={regNumber}
                      onChange={setRegNumber}
                      placeholder={legalType === "limited_company" ? "e.g. 12345678" : "10-digit UTR"}
                    />
                  </LightField>
                </div>
              )}
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              eyebrow="Step 3 · Create your account"
              title={accountPhase === "details" ? "Start your free trial" : "Check your email"}
              subtitle={
                accountPhase === "details"
                  ? `7 days free on ${plan.name}, then ${plan.priceLabel}. No card needed today.`
                  : `We sent a 6-digit code to ${email}. Enter it to activate your trial.`
              }
            >
              <div style={{ maxWidth: 380, margin: "6px auto 0", textAlign: "left" }}>
                {accountPhase === "details" ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <LightField label="Your name">
                      <LightInput value={fullName} onChange={setFullName} placeholder="Jordan Smith" autoFocus />
                    </LightField>
                    <LightField label="Company / trading name">
                      <LightInput value={company} onChange={setCompany} placeholder="Smith Maintenance Ltd" />
                    </LightField>
                    <LightField label="Work email">
                      <LightInput value={email} onChange={setEmail} placeholder="you@company.co.uk" type="email" />
                    </LightField>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <LightField label="6-digit code">
                      <LightInput
                        value={otp}
                        onChange={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        autoFocus
                        style={{ letterSpacing: "0.4em", fontSize: 20, textAlign: "center", fontFamily: T.mono }}
                      />
                    </LightField>
                    {devCode && (
                      <p style={{ fontSize: 12, color: T.mute }}>
                        Dev code: <span style={{ fontFamily: T.mono, color: T.coral }}>{devCode}</span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAccountPhase("details");
                        setOtp("");
                        setError(null);
                      }}
                      style={{ background: "transparent", border: "none", color: T.slate, fontFamily: T.sans, fontSize: 13, cursor: "pointer", textAlign: "left", padding: 0 }}
                    >
                      ← Use a different email
                    </button>
                  </div>
                )}
              </div>
            </StepShell>
          )}

          {step === 3 && <DocumentsStep onFinish={() => (window.location.href = "/")} />}

          {error && (
            <p style={{ marginTop: 20, color: T.red, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="alert-triangle" size={14} /> {error}
            </p>
          )}
        </div>
      </main>

      {/* Footer CTA (steps 0–2 only; documents step owns its own CTA) */}
      {step < 3 && (
        <footer style={FOOTER_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 420 }}>
            {(step > 0 || (step === 2 && accountPhase === "code")) && (
              <Button variant="secondary" size="lg" onClick={goBack} icon="arrow-left" disabled={busy}>
                Back
              </Button>
            )}
            <Button variant="primary" size="lg" full onClick={onPrimary} disabled={primaryDisabled} iconRight={busy ? undefined : "arrow-right"}>
              {busy ? "Please wait…" : primaryLabel}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

// Light, blurred footer bar — echoes the onboarding wizard's fixed footer.
const FOOTER_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 3,
  display: "flex",
  justifyContent: "center",
  padding: "18px 24px 26px",
  borderTop: `1px solid ${T.line}`,
  background: "rgba(247,247,251,0.9)",
  backdropFilter: "blur(12px)",
};

// ---------- Documents step ----------
function DocumentsStep({ onFinish }: { onFinish: () => void }) {
  const [required, setRequired] = useState<RequiredDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, { docId: string; fileName: string }>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/partner/required-docs");
        const data = (await res.json().catch(() => ({}))) as { required?: RequiredDoc[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't load your document checklist.");
        if (alive) setRequired(data.required ?? []);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Couldn't load your document checklist.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const order: RequiredDoc["group"][] = ["core", "legal", "trade_cert"];
    const by: Record<string, RequiredDoc[]> = {};
    for (const r of required ?? []) (by[r.group] ??= []).push(r);
    return order.filter((g) => by[g]?.length).map((g) => ({ group: g, docs: by[g] }));
  }, [required]);

  const total = required?.length ?? 0;
  const done = Object.keys(uploaded).length;
  const allDone = total > 0 && done >= total;

  return (
    <>
      <div style={{ fontFamily: T.mono, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.coralPress, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        Step 4 · Your documents
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>Upload what's required</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
        These are mandatory to take jobs on Fixfy. PDF or image, up to 10&nbsp;MB each.
      </p>
      {total > 0 && (
        <p style={{ fontSize: 14, fontWeight: 600, color: allDone ? T.green : T.slate, marginTop: 16 }}>
          {done} of {total} uploaded
        </p>
      )}

      <div style={{ marginTop: 26, textAlign: "left", maxWidth: 560, marginInline: "auto" }}>
        {loadError && <p style={{ color: T.red, fontSize: 14 }}>{loadError}</p>}
        {!required && !loadError && <p style={{ color: T.mute, fontSize: 14, textAlign: "center" }}>Loading your checklist…</p>}
        {groups.map(({ group, docs }) => (
          <div key={group} style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: T.mute, marginBottom: 10 }}>
              {GROUP_LABELS[group]}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {docs.map((doc) => (
                <DocUploadRow
                  key={doc.id}
                  doc={doc}
                  uploaded={uploaded[doc.id]}
                  onUploaded={(docId, fileName) => setUploaded((prev) => ({ ...prev, [doc.id]: { docId, fileName } }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={FOOTER_STYLE}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Button variant="primary" size="lg" full onClick={onFinish} disabled={!allDone} iconRight="arrow-right">
            {allDone ? "Enter Fixfy" : `Upload all documents (${done}/${total || "…"})`}
          </Button>
        </div>
      </div>
    </>
  );
}

function DocUploadRow({
  doc,
  uploaded,
  onUploaded,
}: {
  doc: RequiredDoc;
  uploaded?: { docId: string; fileName: string };
  onUploaded: (docId: string, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setErr(null);
      setBusy(true);
      try {
        const form = new FormData();
        form.set("docType", doc.docType);
        form.set("name", doc.name);
        form.set("file", file);
        const res = await fetch("/api/partner/documents", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
        onUploaded(data.id ?? "", file.name);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [doc.docType, doc.name, onUploaded],
  );

  const isDone = Boolean(uploaded);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 13,
        border: `1px solid ${isDone ? "rgba(14,138,95,0.35)" : T.line}`,
        background: isDone ? T.green50 : T.white,
        boxShadow: "0 1px 2px rgba(2,0,64,0.05)",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDone ? T.white : T.paper,
          color: isDone ? T.green : T.slate,
        }}
      >
        <Icon name={isDone ? "check" : "file-text"} size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{doc.name}</div>
        <div style={{ fontSize: 12.5, color: T.mute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {err ? <span style={{ color: T.red }}>{err}</span> : uploaded ? uploaded.fileName : doc.description}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <Button variant={isDone ? "secondary" : "primary"} size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : isDone ? "Replace" : "Upload"}
      </Button>
    </div>
  );
}

// ---------- Shared pieces ----------
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 22 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === step ? 26 : 9,
            height: 9,
            borderRadius: 9999,
            background: i <= step ? T.coral : T.lineStrong,
            transition: `all 260ms ${T.ease}`,
          }}
        />
      ))}
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  subtitle,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div style={{ fontFamily: T.mono, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.coralPress, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        {eyebrow}
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>{title}</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>{subtitle}</p>
      {status && <p style={{ fontSize: 14, fontWeight: 600, color: T.coral, marginTop: 18 }}>{status}</p>}
      <div style={{ marginTop: 28 }}>{children}</div>
    </>
  );
}

function CardGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : "repeat(auto-fit, minmax(150px, 1fr))",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}

function SelectCard({
  selected,
  onClick,
  align = "center",
  children,
}: {
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
  align?: "center" | "start";
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        gap: 8,
        minHeight: 108,
        padding: "20px 16px",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: align === "center" ? "center" : "left",
        color: T.ink,
        fontFamily: T.sans,
        background: selected ? T.coralTint : T.white,
        border: `1.5px solid ${selected ? T.coral : hover ? T.lineStrong : T.line}`,
        boxShadow: selected
          ? "0 0 0 1px rgba(237,75,0,0.35), 0 18px 40px -24px rgba(237,75,0,0.5)"
          : hover
            ? "0 1px 2px rgba(2,0,64,0.05), 0 8px 24px -16px rgba(2,0,64,0.18)"
            : "0 1px 2px rgba(2,0,64,0.04)",
        transition: `border-color 140ms ${T.ease}, background 140ms ${T.ease}, box-shadow 140ms ${T.ease}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 22,
          height: 22,
          borderRadius: 9999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: selected ? T.coral : "transparent",
          border: selected ? "none" : `1.5px solid ${T.lineStrong}`,
          color: T.white,
        }}
      >
        {selected && <Icon name="check" size={14} />}
      </span>
      {children}
    </button>
  );
}

function LightField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.mute, marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  );
}

function LightInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  style?: CSSProperties;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: "100%",
        height: 46,
        padding: "0 14px",
        borderRadius: 10,
        border: `1px solid ${focus ? T.coral : T.lineStrong}`,
        background: T.white,
        color: T.ink,
        fontFamily: T.sans,
        fontSize: 15,
        outline: "none",
        boxShadow: focus ? `0 0 0 3px ${T.coralTint}` : "none",
        transition: `border-color 120ms ${T.ease}, box-shadow 120ms ${T.ease}`,
        ...style,
      }}
    />
  );
}

function FunnelWordmark() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 20, letterSpacing: "-0.03em", lineHeight: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/fixfy-icon.png" alt="Fixfy" style={{ height: 22, width: "auto" }} />
      <span>
        <span style={{ color: T.navy }}>fix</span>
        <span style={{ color: T.coral }}>fy</span>
      </span>
    </span>
  );
}
