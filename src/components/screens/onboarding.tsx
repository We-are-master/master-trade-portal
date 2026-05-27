"use client";

// Onboarding — 11-step modal flow. Ported from onboarding.jsx.
// Steps reuse several Settings pages (Trades, Area, Availability, Rates, Docs).

import { useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Badge, Button, Card, Field, Icon, Input, Modal } from "@/components/ui/primitives";
import { Wordmark } from "@/components/shell/sidebar";
import { usePartner } from "@/components/partner-context";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import {
  AvailabilityPage,
  DocsPage,
  PageCard,
  RatesPage,
  Row,
  ServiceAreaPage,
  TradesPage,
} from "./settings";

const ONBOARDING_STEPS = [
  { id: "welcome", label: "Welcome", icon: "sparkles" },
  { id: "details", label: "Your details", icon: "user" },
  { id: "trades", label: "Your trades", icon: "wrench" },
  { id: "area", label: "Service area", icon: "map-pin" },
  { id: "availability", label: "Availability", icon: "calendar-clock" },
  { id: "rates", label: "Rate card", icon: "banknote" },
  { id: "docs", label: "Documents", icon: "shield-check" },
  { id: "selfbill", label: "Self-bill", icon: "receipt" },
  { id: "policies", label: "Policies", icon: "gavel" },
  { id: "payment", label: "Payment", icon: "credit-card" },
  { id: "done", label: "You're in", icon: "check-circle-2" },
];

const DOCS_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.id === "docs");

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
  const toast = useToast();
  const total = ONBOARDING_STEPS.length;
  const next = () => setStep((s) => Math.min(total - 1, s + 1));
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
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 600 }}>
        {/* Step rail */}
        <div style={{ borderRight: `1px solid ${T.line}`, background: T.navy, color: T.white, padding: 24, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
            <Wordmark color={T.white} height={22} />
          </div>
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 14 }}>
            Set-up · {step + 1} of {total}
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
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

          <div style={{ position: "absolute", bottom: 24, fontSize: 11, color: "rgba(255,255,255,0.4)", maxWidth: 200, lineHeight: 1.5 }}>
            Your details are saved as you go. You can pick up where you left off.
          </div>
        </div>

        {/* Step content */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, padding: 32, overflow: "auto" }}>
            <OnboardingStep step={step} setStep={setStep} onDocsChanged={onDocsChanged} />
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 140, height: 4, borderRadius: 9999, background: T.line, overflow: "hidden" }}>
                <div style={{ width: `${((step + 1) / total) * 100}%`, height: "100%", background: T.coral, transition: `width 200ms ${T.ease}` }} />
              </div>
              <span style={{ fontSize: 11.5, color: T.mute, fontFamily: T.mono }}>{Math.round(((step + 1) / total) * 100)}%</span>
            </div>
            {step > 0 && (
              <Button variant="secondary" icon="arrow-left" onClick={prev}>
                Back
              </Button>
            )}
            {step < total - 1 ? (
              <Button variant="primary" iconRight="arrow-right" onClick={next}>
                Continue
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
        <StepWrap kicker="STEP 3" title="Your trades" sub="Pick one primary trade and any others you do. Some require a certificate — you'll upload these in step 7.">
          <TradesPage />
        </StepWrap>
      );
    case 3:
      return (
        <StepWrap kicker="STEP 4" title="Where you work" sub="Bigger area, more jobs, more drive time. You can fine-tune later.">
          <ServiceAreaPage />
        </StepWrap>
      );
    case 4:
      return (
        <StepWrap kicker="STEP 5" title="When you're working" sub="We'll only dispatch jobs inside these windows.">
          <AvailabilityPage />
        </StepWrap>
      );
    case 5:
      return (
        <StepWrap kicker="STEP 6" title="Your rate card" sub="What you charge, all in. We never undercut your pricing.">
          <RatesPage />
        </StepWrap>
      );
    case 6:
      return (
        <StepWrap kicker="STEP 7" title="Documents" sub="Photo ID, proof of address, right to work and public liability — all required before you can pick up work. Trade certificates required by trade.">
          <DocsPage onChanged={onDocsChanged} />
        </StepWrap>
      );
    case 7:
      return <SelfBillStep />;
    case 8:
      return <PoliciesStep />;
    case 9:
      return <PaymentStep />;
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

function WelcomeStep() {
  const partner = usePartner();
  return (
    <div>
      <OBTitle
        kicker="GET STARTED"
        title={`Welcome to Fixfy, ${partner.firstName}.`}
        sub="A trade portal built for UK tradespeople. Your 30-day free trial has started — no card needed. £99/month after, no commission on jobs ever. Let's get you set up in about 8 minutes."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { icon: "percent", title: "0% commission", body: "You keep 100% of every job. We charge a flat £99/month." },
          { icon: "banknote", title: "Net-7 self-bill", body: "Customer signs off → cash in your bank within a week." },
          { icon: "shield-check", title: "You stay in control", body: "Your rates, your area, your hours. We just route the work." },
        ].map((b) => (
          <Card key={b.title} style={{ padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.coralTint, color: T.coral, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Icon name={b.icon} size={16} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.ink }}>{b.title}</div>
            <div style={{ fontSize: 12.5, color: T.slate, marginTop: 4, lineHeight: 1.5 }}>{b.body}</div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 22, padding: 14, background: T.paper, borderRadius: 10, display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: T.slate }}>
        <Icon name="clock" size={16} color={T.mute} />
        About <b style={{ color: T.ink }}>8 minutes</b>. We&apos;ll save your progress — close the tab any time.
      </div>
    </div>
  );
}

function DetailsStep() {
  const partner = usePartner();
  const toast = useToast();
  const [firstName, setFirstName] = useState(partner.firstName);
  const [lastName, setLastName] = useState(partner.lastName);
  const [phone, setPhone] = useState(partner.phone);
  const [tradingName, setTradingName] = useState(partner.tradingName);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await createClient()
        .from("partners")
        .update({ contact_name: `${firstName} ${lastName}`.trim(), phone: phone || null, company_name: tradingName || null })
        .eq("id", partner.id);
      if (error) throw error;
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      toast({ text: "Details saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save details", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <OBTitle kicker="STEP 2" title="Your details" sub="What customers see on every job report. This is your real account — edit and save." />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <Avatar initials={partner.initials} size={68} bg={T.navy} />
        <Button variant="secondary" icon="camera">Upload photo</Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Field label="First name"><Input value={firstName} onChange={setFirstName} placeholder="First name" /></Field>
        <Field label="Last name"><Input value={lastName} onChange={setLastName} placeholder="Last name" /></Field>
        <Field label="Email (verified for sign-in)"><Input value={partner.email} icon="mail" /></Field>
        <Field label="Phone (verified for SMS)"><Input value={phone} onChange={setPhone} icon="phone" placeholder="07…" /></Field>
        <Field label="Trading name (or limited company)"><Input value={tradingName} onChange={setTradingName} /></Field>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <Button variant="primary" icon="check" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>
        {savedAt && <span style={{ fontSize: 12, color: T.green }}>Saved at {savedAt}</span>}
      </div>
    </div>
  );
}

function SelfBillStep() {
  const partner = usePartner();
  return (
    <div>
      <OBTitle kicker="STEP 8" title="Self-bill agreement" sub="We invoice you on your behalf for completed jobs. Sign once, valid for 12 months." />
      <Card style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ padding: 16, background: T.paper, borderRadius: 10, fontSize: 12.5, color: T.slate, lineHeight: 1.6, maxHeight: 180, overflow: "auto" }}>
          <b style={{ color: T.ink }}>HMRC Self-Billing Agreement</b>
          <br />
          Between <b>GET FIXFY LTD</b> (the customer) and <b>{partner.tradingName}</b> (the supplier).
          <br />
          <br />
          1. The customer agrees to issue self-billed invoices for all supplies made by the supplier from the date of this agreement until the date of termination.
          <br />
          2. The customer agrees to inform the supplier should the issue of self-billed invoices be outsourced to a third party.
          <br />
          3. The supplier agrees: (a) to accept the invoices issued by the customer in respect of the supplies made; (b) not to raise sales invoices for the transactions covered by this agreement…
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input type="checkbox" defaultChecked style={{ accentColor: T.coral, marginTop: 3 }} />
          <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
            I agree to the self-billing terms above. Valid 12 months from today.{" "}
            <span className="fx-mono" style={{ color: T.mute }}>
              {new Date().toLocaleDateString("en-GB")}
            </span>
          </span>
        </div>
      </Card>
      <PageCard title="Bank details · for payouts">
        <Row label="Account holder"><Input value="Adeyemi Plumbing Ltd" /></Row>
        <Row label="Sort code"><Input value="" placeholder="XX-XX-XX" /></Row>
        <Row label="Account number"><Input value="" placeholder="8 digits" /></Row>
      </PageCard>
    </div>
  );
}

function PoliciesStep() {
  return (
    <div>
      <OBTitle kicker="STEP 9" title="The rules of the road" sub="Six policies. They're short. Read each, then accept — you can re-read any time in Settings." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          ["Cancellation policy", "x-circle"],
          ["No-show policy", "ban"],
          ["Payment terms", "banknote"],
          ["Conduct standards", "handshake"],
          ["Insurance requirements", "umbrella"],
          ["Strikes & ratings", "shield"],
        ].map(([name, icon]) => (
          <Card key={name} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={icon} size={16} color={T.navy} />
            </div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.ink }}>{name}</div>
            <Button variant="ghost" size="sm" iconRight="arrow-up-right">Read</Button>
            <input type="checkbox" defaultChecked style={{ accentColor: T.coral }} />
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: T.mute, textAlign: "center" }}>You must accept all six to continue.</div>
    </div>
  );
}

function PaymentStep() {
  const partner = usePartner();
  return (
    <div>
      <OBTitle
        kicker="STEP 10"
        title="Card on file"
        sub="3-day free trial. Card captured upfront — you won't be charged until 24 May, and you can cancel any time before then."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <PageCard title="Payment method">
          <Row label="Card number"><Input value="4242 4242 4242 4242" icon="credit-card" /></Row>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Row label="Expiry" columns="1fr"><Input value="09 / 28" /></Row>
            <Row label="CVC" columns="1fr"><Input value="•••" /></Row>
          </div>
          <Row label="Postcode"><Input value={partner.postcode} /></Row>
          <div style={{ marginTop: 12, padding: 12, background: T.paper2, borderRadius: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.slate }}>
            <Icon name="lock" size={13} color={T.mute} />
            Secured by Stripe · PCI-DSS. Fixfy never sees your card number.
          </div>
        </PageCard>
        <Card style={{ padding: 0, background: T.navy, color: T.white, borderColor: T.navy }}>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.4 }}>SUMMARY</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>Fixfy Pro</div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 12 }}>
              <span style={{ fontFamily: T.mono, fontSize: 44, fontWeight: 500, letterSpacing: -1 }}>£99</span>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>/month</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "rgba(237,75,0,0.12)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <Icon name="gift" size={14} color={T.coral} />
              <span>
                First 3 days free · charged <b className="fx-mono">24 May</b>
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function DoneStep() {
  const partner = usePartner();
  const rows: { label: string; value: string }[] = [
    { label: "Name", value: `${partner.firstName} ${partner.lastName}`.trim() || "—" },
    { label: "Trading name", value: partner.tradingName || "—" },
    { label: "Email", value: partner.email || "—" },
    { label: "Phone", value: partner.phone || "—" },
    { label: "Primary trade", value: partner.primaryTrade },
    { label: "Trades", value: partner.trades.join(", ") || "—" },
    { label: "Service area", value: partner.postcode ? `${partner.postcode} · ${partner.radiusMiles} mi` : "—" },
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
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center", gap: 10 }}>
        <Button variant="dark" icon="layout-dashboard">Open dashboard</Button>
      </div>
    </div>
  );
}
