"use client";

// Partner acquisition funnel — collects everything the OS marks mandatory before staff review:
//   0. Trades (service_catalog)
//   1. Contact details (name, email, phone) — saved progressively to OS
//   2. Business type + tax
//   3. Business address
//   4. Account + OTP
//   5. Service area (postcode + radius)
//   6. Documents
//   7. Agreements (e-sign)

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";
import { DEFAULT_PLAN_ID, getPlan, PARTNERS_LP_URL } from "@/lib/plan-catalog";
import { createClient } from "@/lib/supabase/client";
import { fetchContracts, type PartnerContract } from "@/lib/queries/contracts";
import { COMPLIANCE_CONTRACT_TYPES } from "@/lib/partner-funnel-complete";
import { PARTNER_CONTRACT_TITLES } from "@/lib/partner-contract-types";
import {
  filterGetStartedSteps,
  isPartnerRegistrationFieldMandatory,
  isPartnerRegistrationFieldVisible,
  type GetStartedStepId,
} from "@/lib/partner-registration-fields";
import { useRegistrationConfig } from "@/hooks/use-registration-config";
import { GetStartedAddressAutocomplete } from "@/components/get-started/address-autocomplete";

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

const DRAFT_STORAGE_KEY = "fixfy_onboarding_draft_code";
const DRAFT_STEP_STORAGE_KEY = "fixfy_onboarding_step_id";

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
  /** When the email already belongs to a partner and they can pick up where they stopped. */
  const [resumeKind, setResumeKind] = useState<"onboarding" | "reactivate" | null>(null);

  const [coveragePostcode, setCoveragePostcode] = useState("");
  const [coverageRadius, setCoverageRadius] = useState(15);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftCode, setDraftCode] = useState("");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fields: registrationFields, loading: configLoading } = useRegistrationConfig({ public: true });
  const activeSteps = useMemo(() => filterGetStartedSteps(registrationFields), [registrationFields]);
  const totalSteps = Math.max(activeSteps.length, 1);
  const currentStepId: GetStartedStepId = activeSteps[step] ?? activeSteps[0] ?? "account";

  // Once we know which steps are active, restore the last-visited step from
  // localStorage — but only for steps that are safe to hit WITHOUT an
  // authenticated session. Any step at or past `account` requires OTP-backed
  // auth cookies which a returning tab may not have; landing there straight
  // from a refresh causes "Not signed in" errors on save-and-continue. When
  // that happens we start them at the account step so they naturally
  // re-verify (the resume flow re-sends an OTP for existing partners) and
  // then walk through coverage / documents / agreements with a fresh
  // session.
  const SAFE_RESTORE_STEP_IDS = useMemo(
    () => new Set<GetStartedStepId>(["trades", "lead", "business", "contact"]),
    [],
  );
  const stepRestoredRef = useRef(false);
  useEffect(() => {
    if (stepRestoredRef.current) return;
    if (configLoading || activeSteps.length === 0) return;
    if (typeof window === "undefined") return;
    const savedStepId = window.localStorage.getItem(DRAFT_STEP_STORAGE_KEY);
    stepRestoredRef.current = true;
    if (!savedStepId) return;
    if (!SAFE_RESTORE_STEP_IDS.has(savedStepId as GetStartedStepId)) return;
    const idx = activeSteps.indexOf(savedStepId as GetStartedStepId);
    if (idx < 0) return;
    setStep(idx);
  }, [activeSteps, configLoading, SAFE_RESTORE_STEP_IDS]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!stepRestoredRef.current) return;
    // Persist the CURRENT step id (not the numeric index — active steps can
    // shift when Settings toggles a rule) so we can rematch it on return.
    if (currentStepId === "getting_ready" || currentStepId === "how_it_works") return;
    window.localStorage.setItem(DRAFT_STEP_STORAGE_KEY, currentStepId);
  }, [currentStepId]);

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
    if (inviteCode) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(DRAFT_STORAGE_KEY)?.trim() : "";
    if (!stored) return;
    setDraftCode(stored);
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/partner/onboarding-draft?code=${encodeURIComponent(stored)}`);
        const data = (await res.json()) as {
          ok?: boolean;
          email?: string;
          fullName?: string;
          company?: string;
          phone?: string;
          partnerAddress?: string;
          trades?: string[];
          catalogServiceIds?: string[];
          legalType?: "self_employed" | "limited_company" | null;
          regNumber?: string;
          vatRegistered?: boolean | null;
          vatNumber?: string;
          coveragePostcode?: string;
          coverageRadius?: number | null;
        };
        if (!alive || !data.ok) return;
        if (data.email?.trim()) setEmail(data.email.trim());
        if (data.fullName?.trim()) setFullName(data.fullName.trim());
        if (data.company?.trim()) setCompany(data.company.trim());
        if (data.phone?.trim()) setPhone(data.phone.trim());
        if (data.partnerAddress?.trim()) setPartnerAddress(data.partnerAddress.trim());
        if (data.legalType === "self_employed" || data.legalType === "limited_company") {
          setLegalType(data.legalType);
        }
        if (data.regNumber?.trim()) setRegNumber(data.regNumber.trim());
        if (data.vatRegistered === true || data.vatRegistered === false) {
          setVatRegistered(data.vatRegistered);
        }
        if (data.vatNumber?.trim()) setVatNumber(data.vatNumber.trim());
        if (data.coveragePostcode?.trim()) setCoveragePostcode(data.coveragePostcode.trim());
        if (data.coverageRadius && data.coverageRadius >= 1 && data.coverageRadius <= 50) {
          setCoverageRadius(data.coverageRadius);
        }
        if (data.catalogServiceIds?.length && catalog.length) {
          const ids = new Set(data.catalogServiceIds.filter((id) => catalog.some((c) => c.id === id)));
          if (ids.size > 0) {
            setEnabledIds(ids);
            setPrimaryId(data.catalogServiceIds[0] ?? [...ids][0] ?? null);
          }
        } else if (data.trades?.length && catalog.length) {
          const matched = catalog.filter((t) => data.trades!.some((n) => n.toLowerCase() === t.name.toLowerCase()));
          if (matched.length) {
            const ids = new Set(matched.map((t) => t.id));
            setEnabledIds(ids);
            setPrimaryId(matched[0]?.id ?? null);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [inviteCode, catalog]);

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

  const leadValid =
    fullName.trim().length > 0 &&
    company.trim().length > 0 &&
    email.includes("@") &&
    (!showPhone || !isPartnerRegistrationFieldMandatory("phone", registrationFields) || phone.trim().length > 0);

  const saveDraft = useCallback(
    async (opts?: { requireEmail?: boolean }) => {
      const { names, primaryName, ids } = selectedTradeNames;
      const trimmedEmail = email.trim().toLowerCase();
      const hasInvite = Boolean(inviteCode.trim());
      const hasDraft = Boolean(draftCode.trim());
      if (opts?.requireEmail && !trimmedEmail.includes("@") && !hasInvite && !hasDraft) {
        return null;
      }
      if (!hasInvite && !hasDraft && !trimmedEmail.includes("@")) {
        return null;
      }

      const res = await fetch("/api/partner/onboarding-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode || undefined,
          draftCode: draftCode || undefined,
          email: trimmedEmail || undefined,
          fullName: fullName.trim() || undefined,
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          partnerAddress: partnerAddress.trim() || undefined,
          trades: names.length ? names : undefined,
          primaryTrade: primaryName || undefined,
          catalogServiceIds: ids.length ? ids : undefined,
          legalType: legalType ?? undefined,
          regNumber: regNumber.trim() || undefined,
          vatRegistered: vatRegistered ?? undefined,
          vatNumber: vatNumber.trim() || undefined,
          coveragePostcode: coveragePostcode.trim() || undefined,
          coverageRadius: coverageRadius,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; draftCode?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save your progress.");
      if (data.draftCode && data.draftCode !== draftCode) {
        setDraftCode(data.draftCode);
        window.localStorage.setItem(DRAFT_STORAGE_KEY, data.draftCode);
      }
      return data;
    },
    [
      selectedTradeNames,
      inviteCode,
      draftCode,
      email,
      fullName,
      company,
      phone,
      partnerAddress,
      legalType,
      regNumber,
      vatRegistered,
      vatNumber,
      coveragePostcode,
      coverageRadius,
    ],
  );

  useEffect(() => {
    // Debounced auto-save on every step that collects data — keeps the
    // partner row in sync in the background so a browser refresh (or a
    // return-visit days later) hydrates the wizard right where they stopped.
    const drafty =
      currentStepId === "trades" ||
      currentStepId === "lead" ||
      currentStepId === "business" ||
      currentStepId === "contact" ||
      currentStepId === "coverage";
    if (!drafty) return;
    if (!email.includes("@") && !inviteCode && !draftCode) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      void saveDraft().catch(() => {
        /* silent while typing */
      });
    }, 700);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [
    currentStepId,
    email,
    fullName,
    company,
    phone,
    saveDraft,
    inviteCode,
    draftCode,
    selectedTradeNames,
    legalType,
    regNumber,
    vatRegistered,
    vatNumber,
    partnerAddress,
    coveragePostcode,
    coverageRadius,
  ]);

  const regLabel = legalType === "limited_company" ? "Company number (CRN)" : "UTR (Unique Taxpayer Reference)";
  const detailsValid = leadValid;

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
      credentials: "same-origin",
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
    if (profRes.status === 401) {
      const err = new Error("Your session expired — verify your email again to continue.") as Error & {
        status?: number;
      };
      err.status = 401;
      throw err;
    }
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
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        devCode?: string;
        resume?: "onboarding" | "reactivate";
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      setDevCode(data.devCode ?? null);
      if (data.devCode) setOtp(data.devCode);
      setResumeKind(data.resume ?? null);
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
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), token: otp.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work.");

      // Resume flow: the partner already has profile data on file, so we skip
      // saveProfile (which would blank out empty fields the user hasn't
      // re-entered) and jump straight to the next step.
      if (!resumeKind) {
        try {
          await saveProfile();
        } catch (e) {
          // If the auth cookie is missing right after verifyOtp (rare race
          // in dev when Turbopack reloads), don't abandon the user — the
          // session cookie IS set by now, next click will pick it up.
          if ((e as { status?: number })?.status !== 401) throw e;
        }
      }
      // Clear the resume marker so subsequent bounces don't loop back to the
      // welcome copy after a successful verify.
      setResumeKind(null);
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
        credentials: "same-origin",
        body: JSON.stringify({ postcode: coveragePostcode.trim(), radiusMiles: coverageRadius }),
      });
      // Auth endpoint 401'd (session cookie missing / expired). Instead of
      // bouncing the user backwards, we save the same fields via the public
      // draft endpoint (service-role write) and advance. Ops can geocode
      // later, and the partner keeps their momentum.
      if (covRes.status === 401) {
        try {
          await saveDraft();
        } catch {
          /* draft can gracefully fail — data was already saved by the
             debounced auto-save while the user was on the step */
        }
        goNext();
        return;
      }
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
      if (inviteCode) {
        setBusy(true);
        void saveDraft()
          .then(() => goNext())
          .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save your trades."))
          .finally(() => setBusy(false));
        return;
      }
      goNext();
    } else if (currentStepId === "lead") {
      if (!leadValid) return;
      setBusy(true);
      void saveDraft({ requireEmail: true })
        .then(() => goNext())
        .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save your details."))
        .finally(() => setBusy(false));
    } else if (currentStepId === "business") {
      if (showLegalType && isPartnerRegistrationFieldMandatory("legal_type", registrationFields) && !legalType) return;
      if (showTaxId && isPartnerRegistrationFieldMandatory("tax_id", registrationFields) && !regNumber.trim()) return;
      if (showVat && legalType === "limited_company") {
        if (isPartnerRegistrationFieldMandatory("vat", registrationFields) && vatRegistered === null) return;
        if (vatRegistered === true && !vatNumber.trim()) return;
      }
      goNext();
    } else if (currentStepId === "contact") {
      if (showAddress && isPartnerRegistrationFieldMandatory("address", registrationFields) && !partnerAddress.trim()) return;
      setBusy(true);
      void saveDraft({ requireEmail: true })
        .then(() => goNext())
        .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save your address."))
        .finally(() => setBusy(false));
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
    if (currentStepId === "lead") return "Continue";
    if (currentStepId === "business") return "Continue";
    if (currentStepId === "contact") return "Continue";
    if (currentStepId === "account") return accountPhase === "details" ? "Send my code" : "Verify & continue";
    if (currentStepId === "coverage") return "Continue";
    return "";
  })();

  const primaryDisabled = (() => {
    if (busy || configLoading) return true;
    if (currentStepId === "trades") return enabledIds.size === 0 || !primaryId || catalogLoading;
    if (currentStepId === "lead") return !leadValid;
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
      return isPartnerRegistrationFieldMandatory("address", registrationFields) && !partnerAddress.trim();
    }
    if (currentStepId === "account") return accountPhase === "details" ? !detailsValid : otp.trim().length !== 6;
    if (currentStepId === "coverage") {
      return isPartnerRegistrationFieldMandatory("coverage", registrationFields) && !coveragePostcode.trim();
    }
    return false;
  })();

  const showFooter =
    currentStepId !== "documents" &&
    currentStepId !== "agreements" &&
    currentStepId !== "getting_ready" &&
    currentStepId !== "how_it_works";

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
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleTrade(c.id)}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: `1.5px solid ${isPrimary ? T.coral : on ? T.lineStrong : T.line}`,
                          background: on ? T.coralTint : T.white,
                          cursor: "pointer",
                          width: "100%",
                          textAlign: "left",
                          fontFamily: T.sans,
                          color: T.ink,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, flex: 1 }}>{c.name}</span>
                          {isPrimary && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: T.coral, textTransform: "uppercase", letterSpacing: "0.06em" }}>Primary</span>
                          )}
                          <span
                            aria-hidden
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 9999,
                              border: on ? "none" : `1.5px solid ${T.lineStrong}`,
                              background: on ? T.coral : "transparent",
                              color: T.white,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {on && <Icon name="check" size={12} />}
                          </span>
                        </div>
                        {on && !isPrimary && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              makePrimary(c.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                makePrimary(c.id);
                              }
                            }}
                            style={{ marginTop: 10, display: "inline-block", color: T.coral, fontFamily: T.sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          >
                            Make primary
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </StepShell>
          )}

          {currentStepId === "lead" && (
            <StepShell
              eyebrow="Step 2 · Your details"
              title="Your details"
              subtitle="Name, email, and phone — the basics to get you set up."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 12 }}>
                <LightField label="Your name">
                  <LightInput value={fullName} onChange={setFullName} placeholder="Jordan Smith" autoFocus />
                </LightField>
                <LightField label="Company / trading name">
                  <LightInput value={company} onChange={setCompany} placeholder="Smith Maintenance Ltd" />
                </LightField>
                <LightField label="Work email">
                  <LightInput value={email} onChange={setEmail} placeholder="you@company.co.uk" type="email" />
                </LightField>
                {showPhone && (
                  <LightField label="Mobile number">
                    <LightInput value={phone} onChange={setPhone} placeholder="07XXX XXXXXX" type="tel" />
                  </LightField>
                )}
              </div>
            </StepShell>
          )}

          {currentStepId === "business" && (
            <StepShell
              eyebrow="Step 3 · Your business"
              title="How do you trade?"
              subtitle="This sets which tax and compliance documents you'll need."
            >
              <CardGrid cols={2}>
                {showLegalType && (
                  <>
                    <SelectCard selected={legalType === "self_employed"} onClick={() => setLegalType("self_employed")} align="start">
                      <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: T.ink, lineHeight: 1.25 }}>Sole trader</span>
                      <span style={{ display: "block", marginTop: 4, fontSize: 13, color: T.mute, lineHeight: 1.35 }}>Self-employed · you&apos;ll provide your UTR</span>
                    </SelectCard>
                    <SelectCard selected={legalType === "limited_company"} onClick={() => setLegalType("limited_company")} align="start">
                      <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: T.ink, lineHeight: 1.25 }}>Limited company</span>
                      <span style={{ display: "block", marginTop: 4, fontSize: 13, color: T.mute, lineHeight: 1.35 }}>Registered at Companies House</span>
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
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                        <SelectCard selected={vatRegistered === true} onClick={() => setVatRegistered(true)} size="compact">
                          <span style={{ fontSize: 14, fontWeight: 600 }}>Yes</span>
                        </SelectCard>
                        <SelectCard selected={vatRegistered === false} onClick={() => setVatRegistered(false)} size="compact">
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
              eyebrow="Step 4 · Contact & address"
              title="How can we reach you?"
              subtitle="Your business address helps us verify your profile and match local work."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 12 }}>
                {showAddress && (
                  <LightField label="Business address">
                    <GetStartedAddressAutocomplete
                      value={partnerAddress}
                      onChange={setPartnerAddress}
                      placeholder="Start typing your address or postcode…"
                      autoFocus
                    />
                  </LightField>
                )}
              </div>
            </StepShell>
          )}

          {currentStepId === "account" && (
            <StepShell
              eyebrow={
                resumeKind === "reactivate"
                  ? "Step 5 · Welcome back"
                  : resumeKind === "onboarding"
                    ? "Step 5 · Continue where you stopped"
                    : "Step 5 · Create your account"
              }
              title={
                accountPhase === "details"
                  ? "Verify your email"
                  : resumeKind
                    ? "Check your email to continue"
                    : "Check your email"
              }
              subtitle={
                accountPhase === "details"
                  ? `We'll send a 6-digit code to ${email || "your email"} so you can continue. 7 days free on ${plan.name} — no card needed today.`
                  : resumeKind === "reactivate"
                    ? `Your account was set inactive. Enter the 6-digit code we just sent to ${email} — we'll reactivate you and pick up onboarding.`
                    : resumeKind === "onboarding"
                      ? `We already have your onboarding on file. Enter the 6-digit code we just sent to ${email} — you'll skip straight to what's missing.`
                      : `We sent a 6-digit code to ${email}. Enter it to continue.`
              }
            >
              <div style={{ maxWidth: 380, margin: "6px auto 0", textAlign: "left" }}>
                {accountPhase === "details" ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: `1px solid ${T.line}`,
                        background: T.white,
                        textAlign: "left",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 13, color: T.mute }}>Signing up as</p>
                      <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600, color: T.ink }}>{fullName || "—"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{company || "—"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{email || "—"}</p>
                      {phone.trim() ? <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{phone}</p> : null}
                    </div>
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
                        setResumeKind(null);
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
              eyebrow="Step 6 · Service area"
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
                // Instead of going straight to the portal we advance to the
                // gamified "getting ready" step which auto-transitions into
                // the "how it works" summary before dropping the partner in.
                goNext();
              }}
            />
          )}
          {currentStepId === "getting_ready" && (
            <GettingReadyStep onDone={goNext} />
          )}
          {currentStepId === "how_it_works" && (
            <HowItWorksStep
              onFinish={() => {
                if (typeof window !== "undefined") {
                  // Wizard done — drop the saved step so a future revisit
                  // doesn't land on this closing screen again.
                  window.localStorage.removeItem(DRAFT_STEP_STORAGE_KEY);
                  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
                }
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
        // Prefer the OTP session; if the cookie hasn't stuck, fall back to
        // the wizard's draft code so we still get the correct checklist.
        const draftCode =
          typeof window !== "undefined"
            ? window.localStorage.getItem(DRAFT_STORAGE_KEY)?.trim() ?? ""
            : "";
        const url = draftCode
          ? `/api/partner/required-docs?code=${encodeURIComponent(draftCode)}`
          : "/api/partner/required-docs";
        const res = await fetch(url, { credentials: "same-origin" });
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
  const [signerName, setSignerName] = useState(signerDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PartnerContract | null>(null);
  /** Per-contract consent — the checkbox next to each agreement row. */
  const [consented, setConsented] = useState<Record<string, boolean>>({});

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

  // Render both compliance contracts even if one has no active DB version yet
  // — merge DB rows into a full slot list keyed by the constant.
  const complianceContracts = useMemo<PartnerContract[]>(() => {
    const byType = new Map<string, PartnerContract>();
    for (const c of contracts) {
      if (COMPLIANCE_CONTRACT_TYPES.includes(c.type as (typeof COMPLIANCE_CONTRACT_TYPES)[number])) {
        byType.set(c.type, c);
      }
    }
    return COMPLIANCE_CONTRACT_TYPES.map((type) => {
      const existing = byType.get(type);
      if (existing) return existing;
      return {
        versionId: `stub-${type}`,
        type,
        title:
          PARTNER_CONTRACT_TITLES[type as keyof typeof PARTNER_CONTRACT_TITLES] ??
          type.replace(/_/g, " "),
        version: "",
        bodyHtml: "",
        signed: false,
        signedAt: null,
        signaturePdfUrl: null,
      };
    });
  }, [contracts]);
  const unsigned = complianceContracts.filter((c) => !c.signed);
  const allSigned = complianceContracts.length > 0 && unsigned.length === 0;
  const allConsented = unsigned.every((c) => consented[c.type] === true);
  const canSubmit = !allSigned && allConsented && !!signerName.trim() && unsigned.length > 0;

  /**
   * Build a small PNG rendering of the typed signer name — click-through
   * agreements don't require a drawn signature but the sign-all endpoint
   * still needs a base64 image, so we render the name in a cursive style
   * for the audit trail PDF.
   */
  const renderTypedSignaturePng = (name: string): string | null => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0d0a2a";
    ctx.font = "italic 46px 'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.trim(), canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL("image/png");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const typedPng = renderTypedSignaturePng(signerName);
      if (!typedPng) throw new Error("Couldn't capture your consent.");
      const draftCode =
        typeof window !== "undefined"
          ? window.localStorage.getItem(DRAFT_STORAGE_KEY)?.trim() ?? ""
          : "";
      const res = await fetch("/api/contracts/sign-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          signatureImageBase64: typedPng,
          signerName: signerName.trim(),
          deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          code: draftCode || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't record your consent");
      onFinish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record your consent");
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
              {complianceContracts.map((c) => {
                const isConsented = c.signed || !!consented[c.type];
                return (
                  <label
                    key={c.versionId}
                    htmlFor={`consent-${c.type}`}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1px solid ${isConsented ? "rgba(14,138,95,0.35)" : T.line}`,
                      background: isConsented ? T.green50 : T.white,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      cursor: c.signed ? "default" : "pointer",
                      transition: "border-color 140ms ease, background 140ms ease",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <input
                        id={`consent-${c.type}`}
                        type="checkbox"
                        disabled={c.signed}
                        checked={isConsented}
                        onChange={(e) =>
                          setConsented((prev) => ({ ...prev, [c.type]: e.target.checked }))
                        }
                        style={{ width: 18, height: 18, accentColor: T.coral, cursor: c.signed ? "default" : "pointer" }}
                      />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
                          I agree to the {c.title}
                        </span>
                        {!c.bodyHtml && !c.signed && (
                          <span style={{ fontSize: 11, color: T.mute }}>
                            (draft — full text pending publication)
                          </span>
                        )}
                      </span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setViewing(c);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          fontFamily: T.sans,
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.slate,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        View
                      </button>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.signed ? T.green : isConsented ? T.green : T.coral }}>
                        {c.signed ? "Signed" : isConsented ? "Ready" : "Pending"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {!allSigned && (
              <div style={{ display: "grid", gap: 14 }}>
                <LightField label="Full legal name">
                  <LightInput value={signerName} onChange={setSignerName} placeholder="As shown on your ID" />
                </LightField>
                <p style={{ margin: 0, fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
                  By ticking the boxes above and continuing you accept both agreements. Your name, timestamp
                  and IP address are recorded for the audit trail — no drawn signature required.
                </p>
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
            disabled={busy || (!allSigned && !canSubmit)}
            iconRight="check"
          >
            {busy ? "Recording…" : allSigned ? "Submit application" : mandatory ? "Agree & submit application" : "Agree & continue"}
          </Button>
        </div>
      </div>

      {viewing && (
        <div
          onClick={() => setViewing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,0,64,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              maxHeight: "min(80vh, 900px)",
              background: T.white,
              borderRadius: 16,
              boxShadow: "0 30px 80px -20px rgba(2,0,64,0.55)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${T.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>{viewing.title}</p>
                {viewing.version && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: T.mute }}>Version {viewing.version}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewing(null)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  lineHeight: 1,
                  color: T.slate,
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                padding: "20px 24px",
                overflowY: "auto",
                fontSize: 14,
                lineHeight: 1.6,
                color: T.ink,
              }}
              // Contract HTML comes from our contract_versions table (authored by ops), not user input.
              dangerouslySetInnerHTML={{ __html: viewing.bodyHtml || "<p>No content available yet.</p>" }}
            />
            <div
              style={{
                padding: "14px 20px",
                borderTop: `1px solid ${T.line}`,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <Button variant="secondary" size="md" onClick={() => setViewing(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
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
        // Include the draft code so uploads work even when the OTP session
        // cookie hasn't been received yet by the server route handler.
        const draftCode =
          typeof window !== "undefined"
            ? window.localStorage.getItem(DRAFT_STORAGE_KEY)?.trim() ?? ""
            : "";
        if (draftCode) form.set("code", draftCode);
        const res = await fetch("/api/partner/documents", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
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

function useNarrowLayout(maxWidth = 560) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return narrow;
}

function CardGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  const narrow = useNarrowLayout();
  const columns = narrow ? "1fr" : cols ? `repeat(${cols}, minmax(0, 1fr))` : "repeat(auto-fit, minmax(150px, 1fr))";
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: columns,
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
  size = "default",
  children,
}: {
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
  align?: "center" | "start";
  size?: "default" | "compact";
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const compact = size === "compact";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: compact ? "center" : align === "center" ? "center" : "flex-start",
        justifyContent: compact ? "space-between" : "center",
        gap: compact ? 10 : 8,
        width: "100%",
        minHeight: compact ? 48 : 108,
        padding: compact ? "12px 14px" : "20px 16px",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: compact ? "left" : align === "center" ? "center" : "left",
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
      <span style={{ flex: compact ? 1 : undefined, minWidth: 0, paddingRight: compact ? 0 : 28 }}>{children}</span>
      <span
        style={{
          ...(compact
            ? { position: "relative", top: 0, right: 0, flexShrink: 0 }
            : { position: "absolute", top: 12, right: 12 }),
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
    <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/fixfy-primary-navy.png"
        alt="Fixfy"
        style={{ height: 28, width: "auto", display: "block" }}
      />
    </span>
  );
}

// ─── Gamified loading step ──────────────────────────────────────────────────
/**
 * Full-screen "we're getting you ready" animation. Cycles through 4 states
 * (icon + caption) with a smooth crossfade, drives a progress bar to 100%,
 * then calls onDone. Total run: ~4.8s.
 */
function GettingReadyStep({ onDone }: { onDone: () => void }) {
  const stages = useMemo(
    () => [
      { icon: "shield-check", label: "Pre-validating your documents", tint: "#020040" },
      { icon: "briefcase", label: "Setting up your first job offers", tint: T.coral },
      { icon: "pound-sterling", label: "Locking in your payout schedule", tint: "#0E8A5F" },
      { icon: "sparkles", label: "Polishing the last details", tint: "#8B5CF6" },
    ],
    [],
  );
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(4);

  useEffect(() => {
    const stageMs = 1150;
    const tickMs = 40;
    let mounted = true;
    const tickTimer = setInterval(() => {
      if (!mounted) return;
      setProgress((p) => {
        const cap = 99;
        const next = p + (100 / (stages.length * stageMs)) * tickMs;
        return next >= cap ? cap : next;
      });
    }, tickMs);
    const stageTimer = setInterval(() => {
      if (!mounted) return;
      setStage((s) => (s + 1 < stages.length ? s + 1 : s));
    }, stageMs);
    const doneTimer = setTimeout(() => {
      if (!mounted) return;
      setProgress(100);
      setTimeout(() => {
        if (mounted) onDone();
      }, 260);
    }, stageMs * stages.length + 80);
    return () => {
      mounted = false;
      clearInterval(tickTimer);
      clearInterval(stageTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, stages.length]);

  const current = stages[stage] ?? stages[0];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "60px 24px 40px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 12.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: T.coralPress,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        Getting you ready
      </div>

      <div
        aria-hidden
        style={{
          position: "relative",
          width: 132,
          height: 132,
          borderRadius: "50%",
          background: `${current.tint}12`,
          border: `2px solid ${current.tint}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 320ms ease, border-color 320ms ease, transform 320ms ease",
        }}
      >
        <div
          key={stage}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 92,
            height: 92,
            borderRadius: "50%",
            background: T.white,
            boxShadow: `0 12px 40px -14px ${current.tint}80`,
            animation: "gs-pop 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Icon name={current.icon} size={40} color={current.tint} />
        </div>
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: `2px dashed ${current.tint}40`,
            animation: "gs-spin 6s linear infinite",
          }}
        />
      </div>

      <div style={{ maxWidth: 380 }}>
        <p
          key={`label-${stage}`}
          style={{
            margin: 0,
            fontFamily: T.sans,
            fontSize: 22,
            fontWeight: 700,
            color: T.navy,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            animation: "gs-fade 320ms ease",
          }}
        >
          {current.label}
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: T.mute }}>
          Hold tight — we&apos;re syncing your profile with our platform.
        </p>
      </div>

      <div style={{ width: "min(320px, 100%)" }}>
        <div style={{ height: 6, borderRadius: 999, background: T.line, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, Math.round(progress))}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${T.coral}, ${T.coralPress})`,
              transition: "width 200ms linear",
            }}
          />
        </div>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: T.mono,
            fontSize: 11,
            letterSpacing: "0.12em",
            color: T.mute,
            textAlign: "right",
          }}
        >
          {Math.min(100, Math.round(progress))}%
        </p>
      </div>

      <style>{`
        @keyframes gs-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes gs-pop  { from { transform: scale(0.86); opacity: 0.4; } 60% { transform: scale(1.04); opacity: 1; } to { transform: scale(1); opacity: 1; } }
        @keyframes gs-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── How Fixfy Trade works — summary before entering the portal ────────────
interface PortalPolicies {
  companyName: string;
  supportEmail: string;
  payoutTerms: string;
  partnerCancelFeeGbp: number;
  currency: string;
}

function HowItWorksStep({ onFinish }: { onFinish: () => void }) {
  const [policies, setPolicies] = useState<PortalPolicies | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/policies", { headers: { Accept: "application/json" } });
        const j = (await r.json().catch(() => null)) as PortalPolicies | null;
        if (!cancelled && j) setPolicies(j);
      } catch {
        /* keep defaults below */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payoutTerms = policies?.payoutTerms ?? "Every 2 weeks on Friday";
  const cancelFee = policies?.partnerCancelFeeGbp ?? 15;
  const supportEmail = policies?.supportEmail ?? "support@getfixfy.com";
  const currency = policies?.currency === "USD" ? "$" : "£";

  const tiles: {
    icon: string;
    tint: string;
    title: string;
    body: string;
  }[] = [
    {
      icon: "hand-metal",
      tint: T.coral,
      title: "Jobs come in as offers",
      body:
        "Every lead, quote and booked job hits your inbox as an offer. Accept or decline in seconds — the first partner who accepts locks it in.",
    },
    {
      icon: "pound-sterling",
      tint: "#0E8A5F",
      title: "Payouts land like clockwork",
      body: `${payoutTerms}. We generate the self-bill PDF for you — no invoicing, no chasing.`,
    },
    {
      icon: "calendar-clock",
      tint: "#020040",
      title: "Cancellations have a floor",
      body: `If you have to cancel a booked job, ${currency}${cancelFee.toFixed(0)} covers our re-booking cost. Reschedule with the office to avoid it.`,
    },
    {
      icon: "file-check",
      tint: "#8B5CF6",
      title: "One self-bill agreement",
      body:
        "You signed a single self-bill agreement covering every completed week. No POs, no invoices — Fixfy invoices itself on your behalf.",
    },
    {
      icon: "life-buoy",
      tint: "#0B5FFF",
      title: "Support that answers",
      body: `WhatsApp us or email ${supportEmail} — real humans, most replies inside 30 minutes during working hours.`,
    },
  ];

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "8px 8px 40px",
      }}
    >
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 12.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: T.coralPress,
          marginBottom: 14,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        You&apos;re in · quick tour
      </div>
      <h1
        style={{
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: "-0.03em",
          margin: "0 0 12px",
          color: T.navy,
        }}
      >
        How Fixfy Trade works
      </h1>
      <p
        style={{
          fontSize: 16,
          color: T.slate,
          maxWidth: 460,
          margin: "0 auto",
          lineHeight: 1.5,
        }}
      >
        The 5-second summary — full details live inside the portal at any time.
      </p>

      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
          textAlign: "left",
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.title}
            style={{
              padding: "18px 18px 16px",
              borderRadius: 16,
              background: T.white,
              border: `1px solid ${T.line}`,
              boxShadow: "0 1px 2px rgba(2,0,64,0.04)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${tile.tint}15`,
                border: `1px solid ${tile.tint}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: tile.tint,
              }}
            >
              <Icon name={tile.icon} size={18} color={tile.tint} />
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
              {tile.title}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>{tile.body}</p>
          </div>
        ))}
      </div>

      <div style={FOOTER_STYLE}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 420 }}>
          <Button
            variant="primary"
            size="lg"
            full
            onClick={onFinish}
            disabled={loading}
            iconRight="arrow-right"
          >
            Explore the portal
          </Button>
        </div>
      </div>
    </div>
  );
}
