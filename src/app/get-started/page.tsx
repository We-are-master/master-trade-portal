"use client";

// Partner acquisition funnel — collects everything the OS marks mandatory before staff review:
//   0. Trades (service_catalog)
//   1. Business type + tax
//   2. Contact & address
//   3. Account + OTP
//   4. Service area (postcode + radius)
//   5. Documents
//   6. Agreements (e-sign)

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";
import { SignaturePad } from "@/components/ui/signature-pad";
import { DEFAULT_PLAN_ID, getPlan, PARTNERS_LP_URL } from "@/lib/plan-catalog";
import { createClient } from "@/lib/supabase/client";
import { fetchContracts, type PartnerContract } from "@/lib/queries/contracts";
import { COMPLIANCE_CONTRACT_TYPES } from "@/lib/partner-funnel-complete";
import {
  filterGetStartedSteps,
  isPartnerRegistrationFieldMandatory,
  isPartnerRegistrationFieldVisible,
  type GetStartedStepId,
} from "@/lib/partner-registration-fields";
import { useRegistrationConfig } from "@/hooks/use-registration-config";

type CatalogTrade = { id: string; name: string };
type LegalType = "self_employed" | "limited_company";

type RequiredDoc = {
  id: string;
  docType: string;
  name: string;
  description: string;
  group: "core" | "legal" | "trade_cert";
  mandatory?: boolean;
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
  const sp = useSearchParams();
  const inviteCode = sp.get("invite")?.trim() ?? "";
  const prefillTrades = useMemo(
    () =>
      (sp.get("trades") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [sp],
  );
  const [inviteTradesPrefill, setInviteTradesPrefill] = useState<string[]>([]);
  const tradePrefillNames = useMemo(
    () => [...new Set([...prefillTrades, ...inviteTradesPrefill.map((t) => t.trim().toLowerCase()).filter(Boolean)])],
    [prefillTrades, inviteTradesPrefill],
  );

  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<CatalogTrade[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const [legalType, setLegalType] = useState<LegalType | null>(null);
  const [regNumber, setRegNumber] = useState("");
  const [vatRegistered, setVatRegistered] = useState<boolean | null>(null);
  const [vatNumber, setVatNumber] = useState("");

  const [phone, setPhone] = useState("");
  const [partnerAddress, setPartnerAddress] = useState("");

  const [fullName, setFullName] = useState(sp.get("name")?.trim() ?? "");
  const [company, setCompany] = useState(sp.get("business")?.trim() ?? "");
  const [email, setEmail] = useState(sp.get("email")?.trim() ?? "");
  const [otp, setOtp] = useState("");
  const [accountPhase, setAccountPhase] = useState<"details" | "code">("details");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [coveragePostcode, setCoveragePostcode] = useState("");
  const [coverageRadius, setCoverageRadius] = useState(15);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { fields: registrationFields, loading: configLoading } = useRegistrationConfig({ public: true });
  const activeSteps = useMemo(() => filterGetStartedSteps(registrationFields), [registrationFields]);
  const totalSteps = Math.max(activeSteps.length, 1);
  const currentStepId: GetStartedStepId = activeSteps[step] ?? activeSteps[0] ?? "account";

  const showLegalType = isPartnerRegistrationFieldVisible("legal_type", registrationFields);
  const showTaxId = isPartnerRegistrationFieldVisible("tax_id", registrationFields);
  const showVat = isPartnerRegistrationFieldVisible("vat", registrationFields);
  const showPhone = isPartnerRegistrationFieldVisible("phone", registrationFields);
  const showAddress = isPartnerRegistrationFieldVisible("address", registrationFields);
  const documentsMandatory = isPartnerRegistrationFieldMandatory("documents", registrationFields);
  const agreementsMandatory = isPartnerRegistrationFieldMandatory("agreements", registrationFields);

  useEffect(() => {
    if (!inviteCode) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/auth/invite?code=${encodeURIComponent(inviteCode)}`);
        const data = (await res.json()) as {
          ok?: boolean;
          email?: string;
          contactName?: string;
          companyName?: string;
          phone?: string;
          partnerAddress?: string;
          trades?: string[];
          hasAuth?: boolean;
        };
        if (!alive || !data.ok) return;
        if (data.email?.trim()) setEmail(data.email.trim());
        if (data.contactName?.trim()) setFullName(data.contactName.trim());
        if (data.companyName?.trim()) setCompany(data.companyName.trim());
        if (data.phone?.trim()) setPhone(data.phone.trim());
        if (data.partnerAddress?.trim()) setPartnerAddress(data.partnerAddress.trim());
        if (data.trades?.length) setInviteTradesPrefill(data.trades);
        if (data.hasAuth) window.location.href = "/";
      } catch {
        /* URL query prefill still applies */
      }
    })();
    return () => {
      alive = false;
    };
  }, [inviteCode]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/public/trades");
        const data = (await res.json()) as { trades?: CatalogTrade[] };
        if (!alive) return;
        const list = data.trades ?? [];
        setCatalog(list);
        if (list.length > 0) {
          const matched = list.filter((t) => tradePrefillNames.includes(t.name.toLowerCase()));
          const ids = new Set(matched.length ? matched.map((t) => t.id) : [list[0].id]);
          setEnabledIds(ids);
          setPrimaryId(matched[0]?.id ?? list[0].id);
        }
      } catch {
        /* empty catalog handled in UI */
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tradePrefillNames]);

  const plan = getPlan(DEFAULT_PLAN_ID);

  useEffect(() => {
    if (step >= activeSteps.length && activeSteps.length > 0) {
      setStep(activeSteps.length - 1);
    }
  }, [step, activeSteps.length]);

  const toggleTrade = (id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      const wasOn = next.has(id);
      if (wasOn) next.delete(id);
      else next.add(id);
      setPrimaryId((pid) => {
        if (wasOn && pid === id) {
          const remaining = [...next];
          return remaining[0] ?? null;
        }
        if (!wasOn && !pid) return id;
        return pid;
      });
      return next;
    });
  };

  const makePrimary = (id: string) => {
    setEnabledIds((prev) => new Set(prev).add(id));
    setPrimaryId(id);
  };

  const selectedTradeNames = useMemo(() => {
    const ids = [...enabledIds];
    const primary = primaryId && enabledIds.has(primaryId) ? primaryId : ids[0];
    const names = ids.map((id) => catalog.find((c) => c.id === id)?.name).filter(Boolean) as string[];
    const primaryName = catalog.find((c) => c.id === primary)?.name ?? names[0] ?? "";
    return { names, primaryName, ids, primary };
  }, [enabledIds, primaryId, catalog]);

  const regLabel = legalType === "limited_company" ? "Company number (CRN)" : "UTR (Unique Taxpayer Reference)";
  const detailsValid = fullName.trim() && company.trim() && email.includes("@");

  const goBack = () => {
    setError(null);
    if (currentStepId === "account" && accountPhase === "code") {
      setAccountPhase("details");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const goNext = () => setStep((s) => Math.min(totalSteps - 1, s + 1));

  const exit = () => {
    window.location.href = PARTNERS_LP_URL;
  };

  const saveProfile = async () => {
    const { names, primaryName, ids } = selectedTradeNames;
    const profRes = await fetch("/api/partner/onboarding-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trades: names,
        primaryTrade: primaryName,
        catalogServiceIds: ids,
        legalType,
        regNumber: regNumber.trim(),
        phone: phone.trim(),
        partnerAddress: partnerAddress.trim(),
        vatRegistered: legalType === "limited_company" ? vatRegistered : null,
        vatNumber: vatNumber.trim(),
      }),
    });
    const prof = (await profRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!profRes.ok || !prof.ok) throw new Error(prof.error || "Couldn't save your details.");
  };

  const createAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          company: company.trim(),
          plan: DEFAULT_PLAN_ID,
          inviteCode: inviteCode || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; devCode?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      setDevCode(data.devCode ?? null);
      if (data.devCode) setOtp(data.devCode);
      setAccountPhase("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create your account.");
    } finally {
      setBusy(false);
    }
  };

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

      await saveProfile();
      goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const saveCoverageAndContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const covRes = await fetch("/api/partner/onboarding-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: coveragePostcode.trim(), radiusMiles: coverageRadius }),
      });
      const cov = (await covRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!covRes.ok || !cov.ok) throw new Error(cov.error || "Couldn't save your service area.");
      goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your service area.");
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (currentStepId === "trades") {
      if (enabledIds.size === 0 || !primaryId) return;
      goNext();
    } else if (currentStepId === "business") {
      if (showLegalType && isPartnerRegistrationFieldMandatory("legal_type", registrationFields) && !legalType) return;
      if (showTaxId && isPartnerRegistrationFieldMandatory("tax_id", registrationFields) && !regNumber.trim()) return;
      if (showVat && legalType === "limited_company") {
        if (isPartnerRegistrationFieldMandatory("vat", registrationFields) && vatRegistered === null) return;
        if (vatRegistered === true && !vatNumber.trim()) return;
      }
      goNext();
    } else if (currentStepId === "contact") {
      if (showPhone && isPartnerRegistrationFieldMandatory("phone", registrationFields) && !phone.trim()) return;
      if (showAddress && isPartnerRegistrationFieldMandatory("address", registrationFields) && !partnerAddress.trim()) return;
      goNext();
    } else if (currentStepId === "account") {
      if (accountPhase === "details") {
        if (detailsValid) void createAccount();
      } else if (otp.trim().length === 6) {
        void verifyAndContinue();
      }
    } else if (currentStepId === "coverage") {
      if (!coveragePostcode.trim() && isPartnerRegistrationFieldMandatory("coverage", registrationFields)) return;
      void saveCoverageAndContinue();
    }
  };

  const primaryLabel = (() => {
    if (currentStepId === "trades") return "Continue";
    if (currentStepId === "business") return "Continue";
    if (currentStepId === "contact") return "Continue";
    if (currentStepId === "account") return accountPhase === "details" ? "Send my code" : "Verify & continue";
    if (currentStepId === "coverage") return "Continue";
    return "";
  })();

  const primaryDisabled = (() => {
    if (busy || configLoading) return true;
    if (currentStepId === "trades") return enabledIds.size === 0 || !primaryId || catalogLoading;
    if (currentStepId === "business") {
      if (showLegalType && isPartnerRegistrationFieldMandatory("legal_type", registrationFields) && !legalType) return true;
      if (showTaxId && isPartnerRegistrationFieldMandatory("tax_id", registrationFields) && !regNumber.trim()) return true;
      if (showVat && legalType === "limited_company") {
        if (isPartnerRegistrationFieldMandatory("vat", registrationFields) && vatRegistered === null) return true;
        if (vatRegistered === true && !vatNumber.trim()) return true;
      }
      return false;
    }
    if (currentStepId === "contact") {
      if (showPhone && isPartnerRegistrationFieldMandatory("phone", registrationFields) && !phone.trim()) return true;
      if (showAddress && isPartnerRegistrationFieldMandatory("address", registrationFields) && !partnerAddress.trim()) return true;
      return false;
    }
    if (currentStepId === "account") return accountPhase === "details" ? !detailsValid : otp.trim().length !== 6;
    if (currentStepId === "coverage") {
      return isPartnerRegistrationFieldMandatory("coverage", registrationFields) && !coveragePostcode.trim();
    }
    return false;
  })();

  const showFooter = currentStepId !== "documents" && currentStepId !== "agreements";

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
              width: `${((step + 1) / totalSteps) * 100}%`,
              height: "100%",
              borderRadius: 9999,
              background: T.coral,
              transition: `width 300ms ${T.ease}`,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
          <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11.5, letterSpacing: "0.04em" }}>
            Step {step + 1} of {totalSteps}
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

      <main style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", justifyContent: "center", padding: "48px 24px 170px" }}>
        <div style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
          <StepDots step={step} total={totalSteps} />

          {currentStepId === "trades" && (
            <StepShell
              eyebrow="Step 1 · What you cover"
              title="What work do you do?"
              subtitle="Pick the trades you offer from our platform catalogue. Choose one as your primary trade."
              status={`${enabledIds.size} trade${enabledIds.size === 1 ? "" : "s"} selected`}
            >
              {catalogLoading ? (
                <p style={{ color: T.mute, fontSize: 14 }}>Loading trades…</p>
              ) : catalog.length === 0 ? (
                <p style={{ color: T.mute, fontSize: 14 }}>No trades available right now.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 560, margin: "0 auto", textAlign: "left" }}>
                  {catalog.map((c) => {
                    const on = enabledIds.has(c.id);
                    const isPrimary = on && c.id === primaryId;
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: `1.5px solid ${isPrimary ? T.coral : on ? T.lineStrong : T.line}`,
                          background: on ? T.coralTint : T.white,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, flex: 1 }}>{c.name}</span>
                          {isPrimary && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: T.coral, textTransform: "uppercase", letterSpacing: "0.06em" }}>Primary</span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleTrade(c.id)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 9999,
                              border: on ? "none" : `1.5px solid ${T.lineStrong}`,
                              background: on ? T.coral : "transparent",
                              color: T.white,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {on && <Icon name="check" size={12} />}
                          </button>
                        </div>
                        {on && !isPrimary && (
                          <button
                            type="button"
                            onClick={() => makePrimary(c.id)}
                            style={{ marginTop: 10, padding: 0, background: "transparent", border: "none", color: T.coral, fontFamily: T.sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          >
                            Make primary
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </StepShell>
          )}

          {currentStepId === "business" && (
            <StepShell
              eyebrow="Step 2 · Your business"
              title="How do you trade?"
              subtitle="This sets which tax and compliance documents you'll need."
            >
              <CardGrid cols={2}>
                {showLegalType && (
                  <>
                    <SelectCard selected={legalType === "self_employed"} onClick={() => setLegalType("self_employed")} align="start">
                      <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Sole trader</span>
                      <span style={{ fontSize: 13, color: T.mute }}>Self-employed · you'll provide your UTR</span>
                    </SelectCard>
                    <SelectCard selected={legalType === "limited_company"} onClick={() => setLegalType("limited_company")} align="start">
                      <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>Limited company</span>
                      <span style={{ fontSize: 13, color: T.mute }}>Registered at Companies House</span>
                    </SelectCard>
                  </>
                )}
              </CardGrid>
              {(showTaxId || showVat) && (legalType || !showLegalType) && (
                <div style={{ maxWidth: 420, margin: "22px auto 0", textAlign: "left", display: "grid", gap: 12 }}>
                  {showTaxId && (
                    <LightField label={regLabel}>
                      <LightInput
                        value={regNumber}
                        onChange={setRegNumber}
                        placeholder={legalType === "limited_company" ? "e.g. 12345678" : "10-digit UTR"}
                      />
                    </LightField>
                  )}
                  {showVat && legalType === "limited_company" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>VAT registered?</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <SelectCard selected={vatRegistered === true} onClick={() => setVatRegistered(true)} align="start">
                          <span style={{ fontSize: 14, fontWeight: 600 }}>Yes</span>
                        </SelectCard>
                        <SelectCard selected={vatRegistered === false} onClick={() => setVatRegistered(false)} align="start">
                          <span style={{ fontSize: 14, fontWeight: 600 }}>No</span>
                        </SelectCard>
                      </div>
                      {vatRegistered === true && (
                        <LightField label="VAT number">
                          <LightInput value={vatNumber} onChange={setVatNumber} placeholder="GB123456789" />
                        </LightField>
                      )}
                    </>
                  )}
                </div>
              )}
            </StepShell>
          )}

          {currentStepId === "contact" && (
            <StepShell
              eyebrow="Step 3 · Contact & address"
              title="How can we reach you?"
              subtitle="Your business address helps us verify your profile and match local work."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 12 }}>
                {showPhone && (
                  <LightField label="Mobile number">
                    <LightInput value={phone} onChange={setPhone} placeholder="07XXX XXXXXX" type="tel" autoFocus />
                  </LightField>
                )}
                {showAddress && (
                  <LightField label="Business address">
                    <LightInput value={partnerAddress} onChange={setPartnerAddress} placeholder="Street, city, postcode" />
                  </LightField>
                )}
              </div>
            </StepShell>
          )}

          {currentStepId === "account" && (
            <StepShell
              eyebrow="Step 4 · Create your account"
              title={accountPhase === "details" ? "Start your free trial" : "Check your email"}
              subtitle={
                accountPhase === "details"
                  ? `7 days free on ${plan.name}, then ${plan.priceLabel}. No card needed today.`
                  : `We sent a 6-digit code to ${email}. Enter it to continue.`
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

          {currentStepId === "coverage" && (
            <StepShell
              eyebrow="Step 5 · Service area"
              title="Where do you work?"
              subtitle="Set your base postcode and how far you're willing to travel for jobs."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 16 }}>
                <LightField label="Base postcode">
                  <LightInput value={coveragePostcode} onChange={setCoveragePostcode} placeholder="e.g. SW11 1AA" autoFocus />
                </LightField>
                <LightField label={`Service radius — ${coverageRadius} miles`}>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={coverageRadius}
                    onChange={(e) => setCoverageRadius(Number(e.target.value))}
                    style={{ width: "100%", accentColor: T.coral }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.mute, fontFamily: T.mono }}>
                    <span>1 mi</span>
                    <span>50 mi</span>
                  </div>
                </LightField>
              </div>
            </StepShell>
          )}

          {currentStepId === "documents" && (
            <DocumentsStep mandatory={documentsMandatory} onContinue={goNext} />
          )}
          {currentStepId === "agreements" && (
            <AgreementsStep
              mandatory={agreementsMandatory}
              signerDefault={fullName.trim()}
              onFinish={() => {
                window.location.href = "/?submitted=1";
              }}
            />
          )}

          {error && (
            <p style={{ marginTop: 20, color: T.red, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="alert-triangle" size={14} /> {error}
            </p>
          )}
        </div>
      </main>

      {showFooter && (
        <footer style={FOOTER_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 420 }}>
            {(step > 0 || (currentStepId === "account" && accountPhase === "code")) && (
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

function DocumentsStep({ mandatory, onContinue }: { mandatory: boolean; onContinue: () => void }) {
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

  const mandatoryDocs = useMemo(() => (required ?? []).filter((d) => d.mandatory !== false), [required]);
  const total = mandatory ? mandatoryDocs.length : (required?.length ?? 0);
  const done = mandatory
    ? mandatoryDocs.filter((d) => uploaded[d.id]).length
    : Object.keys(uploaded).length;
  const allDone = mandatory ? (total === 0 || done >= total) : true;

  return (
    <>
      <div style={{ fontFamily: T.mono, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.coralPress, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        Step 6 · Your documents
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>Upload what&apos;s required</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
        {mandatory
          ? "These are mandatory before Fixfy can approve your account. PDF or image, up to 10 MB each."
          : "Upload any documents you'd like us to review. You can add more later in Settings."}
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
          <Button variant="primary" size="lg" full onClick={onContinue} disabled={mandatory && !allDone} iconRight="arrow-right">
            {allDone ? "Continue to agreements" : mandatory ? `Upload all documents (${done}/${total || "…"})` : "Continue"}
          </Button>
        </div>
      </div>
    </>
  );
}

function AgreementsStep({ mandatory, signerDefault, onFinish }: { mandatory: boolean; signerDefault: string; onFinish: () => void }) {
  const [contracts, setContracts] = useState<PartnerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(signerDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) throw new Error("Not signed in");
        const { data: prow } = await supabase.from("partners").select("id").eq("auth_user_id", userId).maybeSingle();
        const pid = (prow as { id?: string } | null)?.id;
        if (!pid) throw new Error("Partner profile not found");
        if (cancelled) return;
        const rows = await fetchContracts(supabase, pid);
        if (!cancelled) {
          setContracts(rows.filter((c) => COMPLIANCE_CONTRACT_TYPES.includes(c.type as (typeof COMPLIANCE_CONTRACT_TYPES)[number])));
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load agreements");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complianceContracts = contracts.filter((c) =>
    COMPLIANCE_CONTRACT_TYPES.includes(c.type as (typeof COMPLIANCE_CONTRACT_TYPES)[number]),
  );
  const unsigned = complianceContracts.filter((c) => !c.signed);
  const allSigned = complianceContracts.length > 0 && unsigned.length === 0;

  const submit = async () => {
    if (!sig || !signerName.trim() || unsigned.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts/sign-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureImageBase64: sig,
          signerName: signerName.trim(),
          deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't sign agreements");
      onFinish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign agreements");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ fontFamily: T.mono, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.coralPress, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        Step 7 · Agreements
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>Sign your agreements</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
        One signature covers all Fixfy partner agreements. We&apos;ll review your application within 24 hours.
      </p>

      <div style={{ marginTop: 26, textAlign: "left", maxWidth: 520, marginInline: "auto" }}>
        {loading && <p style={{ color: T.mute, fontSize: 14, textAlign: "center" }}>Loading agreements…</p>}
        {loadError && <p style={{ color: T.red, fontSize: 14 }}>{loadError}</p>}
        {!loading && !loadError && (
          <>
            <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
              {complianceContracts.map((c) => (
                <div
                  key={c.versionId}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `1px solid ${c.signed ? "rgba(14,138,95,0.35)" : T.line}`,
                    background: c.signed ? T.green50 : T.white,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{c.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.signed ? T.green : T.coral }}>{c.signed ? "Signed" : "Pending"}</span>
                </div>
              ))}
            </div>
            {!allSigned && (
              <div style={{ display: "grid", gap: 14 }}>
                <LightField label="Full legal name">
                  <LightInput value={signerName} onChange={setSignerName} placeholder="As shown on your ID" />
                </LightField>
                <LightField label="Your signature">
                  <SignaturePad onChange={setSig} />
                </LightField>
              </div>
            )}
          </>
        )}
        {error && (
          <p style={{ marginTop: 12, color: T.red, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="alert-triangle" size={14} /> {error}
          </p>
        )}
      </div>

      <div style={FOOTER_STYLE}>
        <div style={{ width: "100%", maxWidth: 420, display: "grid", gap: 10 }}>
          {!mandatory && !allSigned && (
            <Button variant="secondary" size="lg" full onClick={onFinish} disabled={busy}>
              Skip for now
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            full
            onClick={allSigned ? onFinish : submit}
            disabled={busy || (!allSigned && (!sig || !signerName.trim() || unsigned.length === 0))}
            iconRight="check"
          >
            {busy ? "Signing…" : allSigned ? "Submit application" : mandatory ? "Sign & submit application" : "Sign & continue"}
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/fixfy-primary-navy.png"
      alt="Fixfy"
      style={{ height: 32, width: "auto", display: "block" }}
    />
  );
}
