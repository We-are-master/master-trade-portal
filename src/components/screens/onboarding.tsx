"use client";

// Onboarding — 11-step modal flow. Ported from onboarding.jsx.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { OnboardingSaveProvider, useRegisterOnboardingSave, type OnboardingSaveFn } from "@/components/onboarding-save";
import { Avatar, Badge, Button, Card, Field, Icon, Input, Modal } from "@/components/ui/primitives";
import { AuthWordmark, BrandPanelBackground } from "@/components/brand/auth-wordmark";
import { usePartner } from "@/components/partner-context";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { fetchContracts } from "@/lib/queries/contracts";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import { OnboardingPaymentStep } from "@/components/billing/onboarding-payment-step";
import {
  DocsPage,
  PayoutsCardEmbedded,
  PoliciesPage,
  RatesPage,
  SelfBillPage,
  ServiceAreaPage,
  TradesPage,
  type PayoutsCardHandle,
} from "./settings";

const ONBOARDING_STEPS = [
  { id: "welcome", label: "Welcome", icon: "sparkles" },
  { id: "details", label: "Your Details", icon: "user" },
  { id: "trades", label: "Your Trades", icon: "wrench" },
  { id: "area", label: "Service Area", icon: "map-pin" },
  { id: "rates", label: "Rate Card", icon: "banknote" },
  { id: "docs", label: "Documents", icon: "shield-check" },
  { id: "selfbill", label: "Self-Bill", icon: "receipt" },
  { id: "policies", label: "Policies", icon: "gavel" },
  { id: "payment", label: "Payment", icon: "credit-card" },
  { id: "verify", label: "Verification", icon: "search" },
  { id: "done", label: "You're In", icon: "check-circle-2" },
];

const DOCS_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.id === "docs");
const POLICIES_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.id === "policies");

export function Onboarding({
  onClose,
  locked = false,
  onDocsChanged,
}: {
  onClose: () => void;
  // When true the partner is missing required documents — they can't leave onboarding until they
  // upload them. Closing/finishing jumps them to the Documents step instead.
  locked?: boolean;
  onDocsChanged?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const toast = useToast();
  const total = ONBOARDING_STEPS.length;

  // The current step registers its save here; Continue runs it before advancing (so there's no
  // need to click each step's own Save button).
  const saveRef = useRef<OnboardingSaveFn | null>(null);
  const saveCtx = useMemo(() => ({ set: (fn: OnboardingSaveFn | null) => { saveRef.current = fn; } }), []);

  const next = async () => {
    if (saveRef.current) {
      setAdvancing(true);
      try {
        const ok = await saveRef.current();
        if (ok === false) return; // validation failed — stay (step shows its own message)
      } catch {
        return; // save errored — the step surfaces its own toast; stay put
      } finally {
        setAdvancing(false);
      }
    }
    setStep((s) => Math.min(total - 1, s + 1));
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const handleClose = () => {
    if (locked) {
      setStep(DOCS_STEP_INDEX);
      toast({ text: "Upload your required documents to start using Fixfy.", icon: "alert-triangle", tone: "coral" });
      return;
    }
    onClose();
  };

  return (
    <Modal onClose={handleClose} width={980}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          height: "min(680px, calc(90vh - 40px))",
          maxHeight: 680,
          overflow: "hidden",
        }}
      >
        {/* Step rail */}
        <BrandPanelBackground style={{ borderRight: `1px solid ${T.line}`, padding: 24, minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
            <AuthWordmark light size={22} />
          </div>
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 14 }}>
            Set-up · {step + 1} of {total}
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflow: "auto" }}>
            {ONBOARDING_STEPS.map((s, i) => {
              const done = i < step;
              const cur = i === step;
              return (
                <li
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 7,
                    background: cur ? "rgba(255,255,255,0.08)" : "transparent",
                    color: cur ? T.white : done ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)",
                    fontSize: 12.5,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9999,
                      flexShrink: 0,
                      background: done ? T.coral : cur ? T.white : "transparent",
                      color: done ? T.white : cur ? T.navy : "inherit",
                      border: done || cur ? "none" : "1px solid rgba(255,255,255,0.3)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: T.mono,
                    }}
                  >
                    {done ? <Icon name="check" size={11} /> : i + 1}
                  </span>
                  <span>{s.label}</span>
                </li>
              );
            })}
          </ol>

          <div style={{ marginTop: "auto", paddingTop: 24, fontSize: 11, color: "rgba(255,255,255,0.4)", maxWidth: 200, lineHeight: 1.5 }}>
            Your details are saved as you go. You can pick up where you left off.
          </div>
        </BrandPanelBackground>

        {/* Step content */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {/* Top progress — always visible so the partner can see they're moving fast */}
          <div style={{ padding: "16px 32px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.slate, fontFamily: T.mono, letterSpacing: 0.5 }}>
                STEP {step + 1} OF {total} · ABOUT 4 MINUTES
              </span>
              <span style={{ fontSize: 11, color: T.mute, fontFamily: T.mono }}>{Math.round(((step + 1) / total) * 100)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 9999, background: T.line, overflow: "hidden" }}>
              <div style={{ width: `${((step + 1) / total) * 100}%`, height: "100%", background: T.coral, borderRadius: 9999, transition: `width 240ms ${T.ease}` }} />
            </div>
          </div>
          <div style={{ flex: 1, padding: 32, overflow: "auto", minHeight: 0 }}>
            <OnboardingSaveProvider value={saveCtx}>
              <OnboardingStep step={step} setStep={setStep} onDocsChanged={onDocsChanged} />
            </OnboardingSaveProvider>
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ flex: 1 }} />
            {step > 0 && (
              <Button variant="secondary" icon="arrow-left" onClick={prev}>
                Back
              </Button>
            )}
            {step < total - 1 ? (
              <Button variant="primary" iconRight="arrow-right" onClick={next} disabled={advancing}>
                {advancing ? "Saving…" : "Continue"}
              </Button>
            ) : (
              <Button variant="success" icon="check" onClick={handleClose}>
                Take me to the dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OnboardingStep({ step, setStep, onDocsChanged }: { step: number; setStep: (n: number) => void; onDocsChanged?: () => void }) {
  switch (step) {
    case 0:
      return <WelcomeStep />;
    case 1:
      return <DetailsStep />;
    case 2:
      return (
        <StepWrap kicker="STEP 3" title="Your Trades" sub="Turn on the services you offer and pick one as your primary trade.">
          <TradesPage />
        </StepWrap>
      );
    case 3:
      return (
        <StepWrap kicker="STEP 4" title="Where You Work" sub="Bigger area, more jobs, more drive time. You can fine-tune later.">
          <ServiceAreaPage />
        </StepWrap>
      );
    case 4:
      return (
        <StepWrap kicker="STEP 5" title="Your Rate Card" sub="What Fixfy pays you per service — catalog standard by default, or set your own below the ceiling.">
          <RatesPage />
        </StepWrap>
      );
    case 5:
      return (
        <StepWrap kicker="STEP 6" title="Documents" sub="Photo ID, proof of address, right to work and public liability — all required before you can pick up work. Some trades need a certificate too.">
          <DocsPage onChanged={onDocsChanged} />
        </StepWrap>
      );
    case 6:
      return (
        <StepWrap kicker="STEP 7" title="Self-Bill" sub="How you get paid and the agreement for invoicing on your behalf.">
          <SelfBillPage />
        </StepWrap>
      );
    case 7:
      return (
        <StepWrap kicker="STEP 8" title="Policies" sub="Read and sign the agreements. You can re-read any of them any time in Settings.">
          <PoliciesPage />
        </StepWrap>
      );
    case 8:
      return (
        <StepWrap kicker="STEP 9" title="Secure your plan" sub="Add your card — no charge until Fixfy approves your account.">
          <OnboardingPaymentStep />
        </StepWrap>
      );
    case 9:
      return (
        <StepWrap kicker="STEP 10" title="Final check" sub="We're verifying your documents and agreements before you go live.">
          <VerificationStep setStep={setStep} />
        </StepWrap>
      );
    case 10:
      return <DoneStep />;
    default:
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void setStep;
      return null;
  }
}

function OBTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker && <Badge tone="coral" size="sm">{kicker}</Badge>}
      <div style={{ fontSize: 26, fontWeight: 600, color: T.navy, letterSpacing: -0.4, marginTop: kicker ? 10 : 0 }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: T.slate, marginTop: 8, maxWidth: 560, lineHeight: 1.55 }}>{sub}</div>}
    </div>
  );
}

function StepWrap({ kicker, title, sub, children }: { kicker: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div>
      <OBTitle kicker={kicker} title={title} sub={sub} />
      {children}
    </div>
  );
}

interface RequiredDocDef {
  docType: string;
  name: string;
  group?: "core" | "legal" | "trade_cert";
}

function buildVerifyChecks(required: RequiredDocDef[]): string[] {
  const checks = [
    "Photo ID & proof of address",
    "Right to work",
    "Public liability insurance",
  ];
  if (required.some((r) => r.group === "trade_cert")) {
    checks.push("Trade certificates");
  }
  checks.push("Policies & agreements");
  return checks;
}

function VerificationStep({ setStep }: { setStep: (n: number) => void }) {
  const partner = usePartner();
  const toast = useToast();
  const [phase, setPhase] = useState<"scanning" | "failed" | "passed">("scanning");
  const [issues, setIssues] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [activeCheck, setActiveCheck] = useState(0);
  const [verifyChecks, setVerifyChecks] = useState(() => buildVerifyChecks([]));

  useRegisterOnboardingSave(async () => {
    if (phase === "scanning") {
      toast({ text: "Still verifying your documents — this takes about 20 seconds.", icon: "loader" });
      return false;
    }
    if (phase === "failed") {
      toast({ text: "Fix the items below before continuing.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    return true;
  });

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const minMs = 20_000;
    const tickRef: { current: number | undefined } = { current: undefined };

    const run = async () => {
      const found: string[] = [];
      let checks = buildVerifyChecks([]);
      try {
        const supabase = createClient();
        const [docs, reqJson, contracts] = await Promise.all([
          fetchPartnerDocuments(supabase, partner.id),
          fetch("/api/partner/required-docs")
            .then((r) => r.json())
            .catch(() => ({ required: [] as RequiredDocDef[] })),
          fetchContracts(supabase, partner.id),
        ]);

        const required = (Array.isArray(reqJson?.required) ? reqJson.required : []) as RequiredDocDef[];
        checks = buildVerifyChecks(required);
        if (!cancelled) setVerifyChecks(checks);

        tickRef.current = window.setInterval(() => {
          const elapsed = Date.now() - started;
          const pct = Math.min(100, Math.round((elapsed / minMs) * 100));
          setProgress(pct);
          setActiveCheck(Math.min(checks.length - 1, Math.floor((elapsed / minMs) * checks.length)));
        }, 200);

        const satisfy = new Set<PartnerDoc["status"]>(["verified", "pending"]);

        for (const req of required) {
          const doc = docs.find((d) => d.docType === req.docType);
          if (!doc) {
            found.push(`${req.name} — not uploaded`);
          } else if (doc.status === "expired") {
            found.push(`${req.name} — expired`);
          } else if (doc.status === "rejected") {
            found.push(`${req.name} — rejected, please re-upload`);
          } else if (!satisfy.has(doc.status)) {
            found.push(`${req.name} — missing or invalid`);
          }
        }

        for (const c of contracts) {
          if (/employment/i.test(c.type) || /employment/i.test(c.title)) continue;
          if (!c.signed) found.push(`${c.title} — not signed yet`);
        }
      } catch {
        found.push("Documents could not be verified — try again");
        if (!cancelled) setVerifyChecks(checks);
        tickRef.current = window.setInterval(() => {
          const elapsed = Date.now() - started;
          setProgress(Math.min(100, Math.round((elapsed / minMs) * 100)));
          setActiveCheck(Math.min(checks.length - 1, Math.floor((elapsed / minMs) * checks.length)));
        }, 200);
      }

      const wait = Math.max(0, minMs - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;

      if (tickRef.current) window.clearInterval(tickRef.current);
      setProgress(100);
      setActiveCheck(Math.max(0, checks.length - 1));
      setIssues(found);
      setPhase(found.length === 0 ? "passed" : "failed");
    };

    void run();
    return () => {
      cancelled = true;
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [partner.id]);

  if (phase === "passed") {
    return (
      <div style={{ textAlign: "center", padding: "24px 8px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: T.green50, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Icon name="check" size={32} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: T.navy, letterSpacing: -0.3 }}>You passed</div>
        <div style={{ fontSize: 14, color: T.slate, marginTop: 10, maxWidth: 420, margin: "10px auto 0", lineHeight: 1.55 }}>
          You&apos;re cleared and ready to receive jobs. Hit Continue to finish setup — enjoy!
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div style={{ padding: "8px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 9999, background: "#FEF2F2", color: T.coral, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Icon name="alert-triangle" size={28} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.navy }}>We need a few things first</div>
          <div style={{ fontSize: 13.5, color: T.slate, marginTop: 8, lineHeight: 1.5 }}>
            Fix the items below, then come back to this step.
          </div>
        </div>
        <Card style={{ padding: 0, marginBottom: 16 }}>
          {issues.map((issue, i) => (
            <div
              key={issue}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderBottom: i < issues.length - 1 ? `1px solid ${T.line}` : "none",
                fontSize: 13,
                color: T.ink,
              }}
            >
              <Icon name="x" size={14} color={T.coral} />
              {issue}
            </div>
          ))}
        </Card>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" icon="arrow-left" onClick={() => setStep(DOCS_STEP_INDEX)}>
            Go to Documents
          </Button>
          {issues.some((i) => /not signed/i.test(i)) && (
            <Button variant="secondary" onClick={() => setStep(POLICIES_STEP_INDEX)}>
              Go to Policies
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 6, borderRadius: 9999, background: T.line, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: T.coral, borderRadius: 9999, transition: "width 200ms ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: T.mute, fontFamily: T.mono }}>
          <span>Verifying your profile…</span>
          <span>{progress}%</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {verifyChecks.map((label, i) => {
          const done = i < activeCheck;
          const cur = i === activeCheck;
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${cur ? T.coral : T.line}`,
                background: cur ? T.coralTint : done ? T.green50 : T.white,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 9999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done ? T.green : cur ? T.coral : T.paper2,
                  color: done || cur ? T.white : T.mute,
                  flexShrink: 0,
                }}
              >
                {done ? <Icon name="check" size={12} /> : cur ? <Icon name="loader" size={12} /> : <span style={{ fontSize: 10, fontFamily: T.mono }}>{i + 1}</span>}
              </span>
              <span style={{ fontSize: 13.5, color: done ? T.green : cur ? T.ink : T.slate, fontWeight: cur ? 500 : 400 }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WelcomeStep() {
  const partner = usePartner();
  const benefits = [
    {
      icon: "briefcase",
      title: "Real work opportunities",
      body: "Receive live jobs, quote requests and recurring maintenance opportunities from active B2B customers.",
    },
    {
      icon: "sliders-horizontal",
      title: "You stay in control",
      body: "Your rates. Your area. Your availability. You choose the work that fits your business.",
    },
    {
      icon: "clipboard-check",
      title: "Fast and organised operations",
      body: "No chaos, no endless back-and-forth. Structured jobs, tracked communication and clear workflows.",
    },
    {
      icon: "building-2",
      title: "Build long-term relationships",
      body: "Access repeat work opportunities with landlords, offices, agencies and multi-site businesses.",
    },
  ];

  return (
    <div>
      <OBTitle
        kicker="GET STARTED"
        title={`Welcome to Fixfy, ${partner.firstName}.`}
        sub="We connect skilled tradespeople with real maintenance opportunities from businesses, estate agencies and commercial clients across London."
      />
      <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 22, letterSpacing: -0.2 }}>
        More jobs. Better clients. Less chasing.
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.navy, marginBottom: 12, letterSpacing: -0.1 }}>
        Why partners join Fixfy
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {benefits.map((b) => (
          <Card key={b.title} style={{ padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.coralTint, color: T.coral, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Icon name={b.icon} size={16} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.ink }}>{b.title}</div>
            <div style={{ fontSize: 12.5, color: T.slate, marginTop: 4, lineHeight: 1.5 }}>{b.body}</div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 22, padding: 14, background: T.paper, borderRadius: 10, display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
        <Icon name="clock" size={16} color={T.mute} />
        About <b style={{ color: T.ink }}>4 minutes</b> to complete setup. Your progress is saved automatically.
      </div>
    </div>
  );
}

type LegalType = "self_employed" | "limited_company";

function DetailsStep() {
  const partner = usePartner();
  const toast = useToast();
  const payoutsRef = useRef<PayoutsCardHandle | null>(null);
  const [firstName, setFirstName] = useState(partner.firstName);
  const [lastName, setLastName] = useState(partner.lastName);
  const [phone, setPhone] = useState(partner.phone);
  const [tradingName, setTradingName] = useState(partner.tradingName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(partner.avatarUrl ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  // Legal details (mirror the OS add-partner form). Prefilled from the partner row.
  const [legalType, setLegalType] = useState<LegalType>("self_employed");
  const [crn, setCrn] = useState("");
  const [vatRegistered, setVatRegistered] = useState<boolean>(false);
  const [vatNumber, setVatNumber] = useState("");
  const [utr, setUtr] = useState("");

  useEffect(() => {
    let alive = true;
    void createClient()
      .from("partners")
      .select("partner_legal_type, crn, vat_registered, vat_number, utr")
      .eq("id", partner.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const d = data as { partner_legal_type?: string | null; crn?: string | null; vat_registered?: boolean | null; vat_number?: string | null; utr?: string | null };
        setLegalType(d.partner_legal_type === "limited_company" ? "limited_company" : "self_employed");
        setCrn(d.crn ?? "");
        setVatRegistered(!!d.vat_registered);
        setVatNumber(d.vat_number ?? "");
        setUtr(d.utr ?? "");
      });
    return () => { alive = false; };
  }, [partner.id]);

  const uploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/partner/avatar", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setAvatarUrl(json.url ?? null);
      toast({ text: "Logo updated", icon: "check" });
      // No router.refresh() here — it would re-run the server page and close the onboarding modal.
      // The photo shows immediately via local state; the sidebar/dashboard pick it up on next load.
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't upload logo", icon: "alert-triangle", tone: "coral" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (legalType === "limited_company") {
      if (!crn.trim()) {
        toast({ text: "Company number (CRN) is required for a limited company.", icon: "alert-triangle", tone: "coral" });
        return false;
      }
    } else if (!utr.trim()) {
      toast({ text: "Your UTR is required as a sole trader.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    if (vatRegistered && !vatNumber.trim()) {
      toast({ text: "Add your VAT number, or turn VAT registered off.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    setSaving(true);
    try {
      const { error } = await createClient()
        .from("partners")
        .update({
          contact_name: `${firstName} ${lastName}`.trim(),
          phone: phone || null,
          company_name: tradingName || null,
          partner_legal_type: legalType,
          crn: legalType === "limited_company" ? crn.trim() || null : null,
          vat_registered: vatRegistered,
          vat_number: vatRegistered ? vatNumber.trim() || null : null,
          utr: legalType === "self_employed" ? utr.trim() || null : null,
        })
        .eq("id", partner.id);
      if (error) throw error;
      toast({ text: "Details saved", icon: "check" });
      return true;
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save details", icon: "alert-triangle", tone: "coral" });
      return false;
    } finally {
      setSaving(false);
    }
  };
  useRegisterOnboardingSave(async () => {
    const detailsOk = await save();
    if (!detailsOk) return false;
    return payoutsRef.current?.ensureReady() ?? false;
  });

  return (
    <div>
      <OBTitle kicker="STEP 2" title="Your Details" sub="Your profile and tax details — plus connect your bank to get paid." />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <Avatar initials={partner.initials} size={68} bg={T.navy} src={avatarUrl ?? undefined} />
        <label style={{ cursor: uploadingPhoto ? "default" : "pointer" }}>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={uploadingPhoto}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhoto(f);
              e.target.value = "";
            }}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: T.coral }}>
            <Icon name={uploadingPhoto ? "loader" : "camera"} size={14} color={T.coral} />
            {uploadingPhoto ? "Uploading…" : avatarUrl ? "Change Logo" : "Upload Logo"}
          </span>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Field label="First name"><Input value={firstName} onChange={setFirstName} placeholder="First name" /></Field>
        <Field label="Last name"><Input value={lastName} onChange={setLastName} placeholder="Last name" /></Field>
        <Field label="Email (verified for sign-in)"><Input value={partner.email} icon="mail" /></Field>
        <Field label="Phone"><Input value={phone} onChange={setPhone} icon="phone" placeholder="07…" /></Field>
        <Field label="Trading name / company name"><Input value={tradingName} onChange={setTradingName} /></Field>
      </div>

      {/* Legal — sole trader vs limited company. Drives tax fields + compliance docs. */}
      <Field label="How do you trade?">
        <div style={{ display: "inline-flex", gap: 6, background: T.paper2, padding: 3, borderRadius: 10 }}>
          {([["self_employed", "Sole trader"], ["limited_company", "Limited company"]] as const).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => setLegalType(v)}
              style={{
                padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: legalType === v ? T.white : "transparent", color: legalType === v ? T.navy : T.slate,
                boxShadow: legalType === v ? "0 1px 2px rgba(2,0,64,0.12)" : "none",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, marginBottom: 10 }}>
        {legalType === "limited_company" ? (
          <Field label="Company number (CRN)"><Input value={crn} onChange={setCrn} placeholder="e.g. 12345678" icon="hash" /></Field>
        ) : (
          <Field label="UTR (Unique Taxpayer Reference)"><Input value={utr} onChange={setUtr} placeholder="10-digit UTR" icon="hash" /></Field>
        )}
        <Field label="VAT registered?">
          <div style={{ display: "inline-flex", gap: 6, background: T.paper2, padding: 3, borderRadius: 10 }}>
            {([[true, "Yes"], [false, "No"]] as const).map(([v, lbl]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setVatRegistered(v)}
                style={{
                  padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                  background: vatRegistered === v ? T.white : "transparent", color: vatRegistered === v ? T.navy : T.slate,
                  boxShadow: vatRegistered === v ? "0 1px 2px rgba(2,0,64,0.12)" : "none",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </Field>
        {vatRegistered && (
          <Field label="VAT number"><Input value={vatNumber} onChange={setVatNumber} placeholder="GB123456789" prefix="GB" /></Field>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <PayoutsCardEmbedded handleRef={payoutsRef} />
      </div>
    </div>
  );
}

function DoneStep() {
  const partner = usePartner();
  const rows: { label: string; value: string }[] = [
    { label: "Name", value: `${partner.firstName} ${partner.lastName}`.trim() || "—" },
    { label: "Trading Name", value: partner.tradingName || "—" },
    { label: "Email", value: partner.email || "—" },
    { label: "Phone", value: partner.phone || "—" },
    { label: "Primary Trade", value: partner.primaryTrade },
    { label: "Trades", value: partner.trades.join(", ") || "—" },
    { label: "Service Area", value: partner.postcode ? `${partner.postcode} · ${partner.radiusMiles} mi` : "—" },
  ];
  return (
    <div style={{ padding: "20px 8px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: T.green50, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <Icon name="check" size={32} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 600, color: T.navy, letterSpacing: -0.5 }}>You&apos;re in, {partner.firstName}.</div>
        <div style={{ fontSize: 14, color: T.slate, marginTop: 10, maxWidth: 460, margin: "10px auto 0", lineHeight: 1.55 }}>
          {partner.trialDaysLeft > 0 ? (
            <>Your trial has <b style={{ color: T.coral }}>{partner.trialDaysLeft} day{partner.trialDaysLeft === 1 ? "" : "s"}</b> left. Here&apos;s what you registered:</>
          ) : (
            <>Here&apos;s what you registered:</>
          )}
        </div>
      </div>
      <Card style={{ maxWidth: 460, margin: "20px auto 0", padding: 0 }}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              gap: 12,
              padding: "11px 16px",
              borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : "none",
            }}
          >
            <span style={{ flex: "0 0 130px", fontSize: 12.5, color: T.mute }}>{r.label}</span>
            <span style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 18, fontSize: 12.5, color: T.mute, textAlign: "center" }}>
        Use “Take me to the dashboard” below to finish.
      </div>
    </div>
  );
}
