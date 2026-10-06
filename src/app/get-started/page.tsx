"use client";

// Partner acquisition funnel — collects everything the OS marks mandatory before staff review:
//   1. Trades (service_catalog)
//   2. Contact details + address — saved progressively to OS as a draft
//   3. Rates
//   4. Business type + tax. Continue creates the login and signs in, no email
//      code (only an email that already has a login is asked for the code)
//   5. Service area (postcode + radius)
//   6. Tools & materials
//   7. Documents. Photo ID, public liability (min £1m) and the trade registration
//      can't be skipped; the rest can wait for the review screen
//   8. Agreements (e-sign): Partner Agreement, Terms of Use, Invoicing and
//      Payment Collection Agreement, plus the VAT status line (its Annex 1)

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import { Button, Icon, Modal } from "@/components/ui/primitives";
import { PARTNERS_LP_URL } from "@/lib/plan-catalog";
import { serviceCategory, type ServiceCategory } from "@/lib/service-category";
import { createClient } from "@/lib/supabase/client";
import { fetchContracts, type PartnerContract } from "@/lib/queries/contracts";
import {
  INVOICING_CONTRACT_TYPE,
  PARTNER_CONTRACT_SIGNING_ORDER,
  PARTNER_CONTRACT_TITLES,
} from "@/lib/partner-contract-types";
import { vatStatusFromDraft, type VatStatusDraft } from "@/lib/vat-status";
import { VatStatusField } from "@/components/vat-status-field";
import type { ExistingAccountKind } from "@/lib/partner-onboarding-draft";
import {
  filterGetStartedSteps,
  isPartnerRegistrationFieldMandatory,
  isPartnerRegistrationFieldVisible,
  type GetStartedStepId,
} from "@/lib/partner-registration-fields";
import { useRegistrationConfig } from "@/hooks/use-registration-config";
import { MarketingConsent } from "@/components/consent/marketing-consent";
import { rememberClickId, trackOnce } from "@/lib/meta-pixel";
import { GetStartedAddressAutocomplete } from "@/components/get-started/address-autocomplete";
import { RateCardEditor } from "@/components/rate-card-editor";
import { emailProblem, phoneProblem, suggestedEmail } from "@/lib/contact-validation";
import { ONBOARDING_DRAFT_STORAGE_KEY, RequiredDocsList, useRequiredDocs } from "@/components/required-docs";
import { isPlatformBookingRequiredDoc } from "@/lib/partner-required-docs";
import type { ServicePrice } from "@/lib/queries/rate-card";

type CatalogTrade = { id: string; name: string; category?: string };
type LegalType = "self_employed" | "limited_company";

export default function GetStartedPage() {
  // First-party visit tracking (one hit per browser session) for the Master OS
  // partner funnel. Fire-and-forget — never blocks or errors the page.
  useEffect(() => {
    // Clique do anúncio (fbclid) guardado na chegada: o pixel só carrega depois
    // do "Accept", quando a URL pode já não ter o parâmetro.
    rememberClickId();
    try {
      if (sessionStorage.getItem("fx_gs_hit")) return;
      sessionStorage.setItem("fx_gs_hit", "1");
    } catch {
      /* private mode — fall through and still record the hit */
    }
    void fetch("/api/track/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/get-started",
        referrer: (typeof document !== "undefined" && document.referrer) || null,
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return (
    <Suspense fallback={null}>
      <GetStartedFunnel />
      <MarketingConsent />
    </Suspense>
  );
}

const DRAFT_STORAGE_KEY = ONBOARDING_DRAFT_STORAGE_KEY;
const DRAFT_STEP_STORAGE_KEY = "fixfy_onboarding_step_id";
/** Steps before the login exists. Everything after them needs the session. */
const PRE_ACCOUNT_STEP_IDS = new Set<GetStartedStepId>(["trades", "lead", "rates", "business"]);

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
  /** Step 3: rate card for the services ticked in step 1 (standard or own). */
  const [rateRows, setRateRows] = useState<ServicePrice[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);

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
  /** Fix a mistyped email from the account step without going back to step 2. */
  const [emailFix, setEmailFix] = useState<{ value: string; error: string | null; busy: boolean } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  /** Email that already belongs to an active partner: offer sign in instead of a second profile. */
  const [accountExistsEmail, setAccountExistsEmail] = useState<string | null>(null);
  /** When the email already belongs to a partner and they can pick up where they stopped. */
  const [resumeKind, setResumeKind] = useState<"onboarding" | "reactivate" | null>(null);

  /** Details step: show a field's problem once they've left it or pressed Continue. */
  const [touched, setTouched] = useState<{ email?: boolean; phone?: boolean }>({});
  /** The server's verdict on the email / phone (e.g. no such email domain). */
  const [leadFieldError, setLeadFieldError] = useState<{ field: "email" | "phone"; message: string } | null>(null);

  const [coveragePostcode, setCoveragePostcode] = useState("");
  const [coverageRadius, setCoverageRadius] = useState(15);
  const [hasOwnTools, setHasOwnTools] = useState<boolean | null>(null);
  const [canSupplyMaterials, setCanSupplyMaterials] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftCode, setDraftCode] = useState("");
  // Autosave (debounced while typing) and Continue can both fire before the
  // first save returns its draft code, and each would then create its own
  // partner row for the same email. Saves run one at a time and read the
  // latest code from this ref, so only the first one ever creates.
  const draftCodeRef = useRef("");
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fields: registrationFields, loading: configLoading } = useRegistrationConfig({ public: true });
  const activeSteps = useMemo(() => filterGetStartedSteps(registrationFields), [registrationFields]);
  const totalSteps = Math.max(activeSteps.length, 1);
  const currentStepId: GetStartedStepId = activeSteps[step] ?? activeSteps[0] ?? "trades";

  // Trades and Cleaning are different lines of work, and a single alphabetical
  // list put "After Builders Clean" above "Builder". Same order within each
  // group — just split, so a plumber is not scanning past cleaning services.
  const catalogGroups = useMemo(() => {
    // Grupos pela categoria do OS (304), na ordem que a API manda.
    const groups: { label: string; items: CatalogTrade[] }[] = [];
    for (const c of catalog) {
      const label = c.category ?? (serviceCategory(c.name) === "Trades" ? "General Maintenance" : serviceCategory(c.name));
      let g = groups.find((x) => x.label === label);
      if (!g) groups.push((g = { label, items: [] }));
      g.items.push(c);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [catalog]);

  // Once we know which steps are active, restore the last-visited step from
  // localStorage — but only for steps that are safe to hit WITHOUT an
  // authenticated session. Every step after `business` needs the login's
  // cookies, which a returning tab may not have; landing there straight from
  // a refresh causes "Not signed in" errors on save-and-continue. Those start
  // over, and leaving `business` signs them back in (same browser) or asks
  // for the code (the email already has a login).
  const SAFE_RESTORE_STEP_IDS = PRE_ACCOUNT_STEP_IDS;
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
    if (currentStepId === "getting_ready") return;
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
    draftCodeRef.current = stored;
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

  const phoneMandatory = showPhone && isPartnerRegistrationFieldMandatory("phone", registrationFields);
  const emailIssue = emailProblem(email);
  const phoneIssue = showPhone && (phone.trim() || phoneMandatory) ? phoneProblem(phone) : null;
  const emailSuggestion = suggestedEmail(email);
  const emailMessage =
    leadFieldError?.field === "email" ? leadFieldError.message : touched.email ? emailIssue : null;
  const phoneMessage =
    leadFieldError?.field === "phone" ? leadFieldError.message : touched.phone ? phoneIssue : null;

  const leadValid =
    fullName.trim().length > 0 &&
    company.trim().length > 0 &&
    email.includes("@") &&
    (!showPhone || !isPartnerRegistrationFieldMandatory("phone", registrationFields) || phone.trim().length > 0) &&
    (!showAddress || !isPartnerRegistrationFieldMandatory("address", registrationFields) || partnerAddress.trim().length > 0);

  const saveDraft = useCallback(
    (opts?: { requireEmail?: boolean; leadComplete?: boolean }) => {
      const run = async () => {
        const draftCode = draftCodeRef.current;
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
            leadComplete: opts?.leadComplete || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          draftCode?: string;
          accountExists?: ExistingAccountKind;
          field?: "email" | "phone";
        };
        if (!res.ok || !data.ok) {
          throw Object.assign(new Error(data.error || "Couldn't save your progress."), {
            accountExists: data.accountExists,
            field: data.field,
          });
        }
        if (data.draftCode && data.draftCode !== draftCode) {
          draftCodeRef.current = data.draftCode;
          setDraftCode(data.draftCode);
          window.localStorage.setItem(DRAFT_STORAGE_KEY, data.draftCode);
        }
        return data;
      };
      const next = saveChainRef.current.catch(() => undefined).then(run);
      saveChainRef.current = next;
      return next;
    },
    [
      selectedTradeNames,
      inviteCode,
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

  // Load the rate card when the partner reaches it. Services come from the ones
  // they ticked in step 1, already saved on the draft by the details step.
  useEffect(() => {
    if (currentStepId !== "rates") return;
    const code = draftCode || inviteCode;
    if (!code) return;
    let alive = true;
    setRatesLoading(true);
    setRatesError(null);
    const q = draftCode ? `draftCode=${encodeURIComponent(draftCode)}` : `inviteCode=${encodeURIComponent(inviteCode)}`;
    void fetch(`/api/partner/onboarding-rates?${q}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; rows?: ServicePrice[]; error?: string }) => {
        if (!alive) return;
        if (!d.ok) throw new Error(d.error || "Couldn't load your rates.");
        setRateRows(d.rows ?? []);
      })
      .catch((e) => alive && setRatesError(e instanceof Error ? e.message : "Couldn't load your rates."))
      .finally(() => alive && setRatesLoading(false));
    return () => {
      alive = false;
    };
  }, [currentStepId, draftCode, inviteCode, selectedTradeNames]);

  const saveRates = async () => {
    const res = await fetch("/api/partner/onboarding-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftCode: draftCode || undefined, inviteCode: inviteCode || undefined, rows: rateRows }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !d.ok) throw new Error(d.error || "Couldn't save your rates.");
  };

  // Service area starts from the postcode in the address they gave in step 5,
  // so most partners only need to set the radius. Never overwrites a value.
  useEffect(() => {
    if (currentStepId !== "coverage" || coveragePostcode.trim()) return;
    const found = partnerAddress.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
    if (found) setCoveragePostcode(`${found[1]} ${found[2]}`);
  }, [currentStepId, partnerAddress, coveragePostcode]);

  // "When can you work?": dias, horário e máx. de jobs por dia.
  const [workDays, setWorkDays] = useState<Set<string>>(() => new Set(["mon", "tue", "wed", "thu", "fri"]));
  const [workStart, setWorkStart] = useState("08:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [workMax, setWorkMax] = useState(3);
  const saveAvailabilityAndContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/partner/onboarding-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ days: [...workDays], start: workStart, end: workEnd, maxJobsPerDay: workMax }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error || "Couldn't save your availability.");
      goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your availability.");
    } finally {
      setBusy(false);
    }
  };

  const saveEquipmentAndContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/partner/onboarding-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ hasOwnTools, canSupplyMaterials }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error || "Couldn't save your answers.");
      goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answers.");
    } finally {
      setBusy(false);
    }
  };

  const regLabel = legalType === "limited_company" ? "Company number (CRN)" : "UTR (Unique Taxpayer Reference)";

  const goBack = () => {
    setError(null);
    if (accountPhase === "code") {
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
      const err = new Error("Your session expired. Verify your email again to continue.") as Error & {
        status?: number;
      };
      err.status = 401;
      throw err;
    }
    const prof = (await profRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!profRes.ok || !prof.ok) throw new Error(prof.error || "Couldn't save your details.");
  };

  // Signed in (new account, code verified, or already signed in on this
  // browser): save the profile and carry on at the first step that needs the
  // login. A resumed partner already has a profile on file, so we skip
  // saveProfile (which would blank out fields they haven't re-entered).
  const enterAccount = async (resumed: boolean) => {
    if (!resumed) {
      try {
        await saveProfile();
      } catch (e) {
        // Cookie not seen yet on the very next request (rare race in dev when
        // Turbopack reloads): the session IS set, later saves pick it up.
        if ((e as { status?: number })?.status !== 401) throw e;
      }
    }
    setResumeKind(null);
    setAccountPhase("details");
    setOtp("");
    setDevCode(null);
    const next = activeSteps.findIndex((id) => !PRE_ACCOUNT_STEP_IDS.has(id));
    setStep(next >= 0 ? next : activeSteps.length - 1);
  };

  // Creates the login when leaving the business step (or picks an existing
  // one back up) and signs in straight away, no email code. The code screen
  // only shows if the server couldn't sign in, so nobody gets stuck.
  const createAccount = async (emailOverride?: string, opts?: { resuming?: boolean }) => {
    setError(null);
    setBusy(true);
    try {
      const target = (emailOverride ?? email).trim();
      // Came back to the funnel on the same browser, still signed in as this
      // email: nothing to create. (Resumes go to the server, which reactivates
      // an inactive partner.)
      if (!opts?.resuming) {
        const { data: sessionData } = await createClient().auth.getSession();
        if (sessionData.session?.user?.email?.toLowerCase() === target.toLowerCase()) {
          await enterAccount(false);
          return;
        }
      }
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: target,
          fullName: fullName.trim(),
          company: company.trim(),
          inviteCode: inviteCode || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        devCode?: string;
        resume?: "onboarding" | "reactivate";
        signedIn?: boolean;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      if (data.signedIn) {
        await enterAccount(Boolean(opts?.resuming || data.resume));
        return;
      }
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

  // Wrong email on the account step: move the draft to the new address and send
  // the code there, all from a modal, instead of walking back to step 2.
  const applyEmailFix = async () => {
    if (!emailFix) return;
    const next = emailFix.value.trim().toLowerCase();
    if (!next.includes("@") || !next.includes(".")) {
      setEmailFix({ ...emailFix, error: "Enter a valid email." });
      return;
    }
    setEmailFix({ ...emailFix, busy: true, error: null });
    try {
      const code = draftCodeRef.current;
      if (code || inviteCode) {
        const res = await fetch("/api/partner/onboarding-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftCode: code || undefined, inviteCode: inviteCode || undefined, email: next }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          accountExists?: ExistingAccountKind;
        };
        // An active account can't be taken over from here; onboarding / inactive
        // ones go through the signup resume below, which asks for the code.
        if (d.accountExists === "active") throw new Error(d.error || "This email already has a Fixfy account.");
        if ((!res.ok || !d.ok) && !d.accountExists) throw new Error(d.error || "Couldn't update your email.");
      }
      setEmail(next);
      setOtp("");
      setResumeKind(null);
      setEmailFix(null);
      await createAccount(next);
    } catch (e) {
      setEmailFix((f) => (f ? { ...f, busy: false, error: e instanceof Error ? e.message : "Couldn't update your email." } : f));
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
      await enterAccount(Boolean(resumeKind));
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

  // The email already has a login. Nothing was saved on the draft side; the
  // signup route knows this partner and sends the code to pick up where they
  // stopped (onboarding / inactive). Active partners just sign in.
  const resumeExistingAccount = async (e: unknown): Promise<boolean> => {
    const kind = (e as { accountExists?: ExistingAccountKind } | null)?.accountExists;
    if (!kind) return false;
    if (kind === "active") {
      setAccountExistsEmail(email.trim().toLowerCase());
      return true;
    }
    await createAccount(undefined, { resuming: true });
    return true;
  };

  const onPrimary = () => {
    if (accountPhase === "code") {
      if (otp.trim().length === 6) void verifyAndContinue();
      return;
    }
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
      // Made-up email / phone never reach the OS: say what's wrong under the field.
      if (emailIssue || phoneIssue) {
        setTouched({ email: true, phone: true });
        return;
      }
      setBusy(true);
      // From here the partner shows in the OS Onboarding tab with their contact info.
      void saveDraft({ requireEmail: true, leadComplete: true })
        .then(() => {
          // Meta: começou o cadastro (só com o sim de cookies).
          trackOnce("Lead");
          goNext();
        })
        .catch(async (e) => {
          if (await resumeExistingAccount(e)) return;
          const field = (e as { field?: "email" | "phone" } | null)?.field;
          if (field && e instanceof Error) {
            setLeadFieldError({ field, message: e.message });
            return;
          }
          setError(e instanceof Error ? e.message : "Couldn't save your details.");
        })
        .finally(() => setBusy(false));
    } else if (currentStepId === "rates") {
      setBusy(true);
      void saveRates()
        .then(() => goNext())
        .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save your rates."))
        .finally(() => setBusy(false));
    } else if (currentStepId === "business") {
      if (showLegalType && isPartnerRegistrationFieldMandatory("legal_type", registrationFields) && !legalType) return;
      if (showTaxId && isPartnerRegistrationFieldMandatory("tax_id", registrationFields) && !regNumber.trim()) return;
      if (showVat && legalType === "limited_company") {
        if (isPartnerRegistrationFieldMandatory("vat", registrationFields) && vatRegistered === null) return;
        if (vatRegistered === true && !vatNumber.trim()) return;
      }
      // Last step before the account: make sure everything so far is on the
      // draft, then create the login.
      setBusy(true);
      void saveDraft({ requireEmail: true })
        .then(() => createAccount())
        .catch(async (e) => {
          if (await resumeExistingAccount(e)) return;
          setError(e instanceof Error ? e.message : "Couldn't save your details.");
        })
        .finally(() => setBusy(false));
    } else if (currentStepId === "equipment") {
      if (hasOwnTools !== true || canSupplyMaterials !== true) return;
      void saveEquipmentAndContinue();
    } else if (currentStepId === "availability") {
      if (workDays.size === 0) return;
      void saveAvailabilityAndContinue();
    } else if (currentStepId === "coverage") {
      if (!coveragePostcode.trim() && isPartnerRegistrationFieldMandatory("coverage", registrationFields)) return;
      void saveCoverageAndContinue();
    }
  };

  const primaryLabel = (() => {
    if (accountPhase === "code") return "Verify & continue";
    if (currentStepId === "trades") return "Continue";
    if (currentStepId === "lead") return "Continue";
    if (currentStepId === "rates") return "Continue";
    if (currentStepId === "business") return "Continue";
    if (currentStepId === "coverage") return "Continue";
    if (currentStepId === "equipment") return "Continue";
    if (currentStepId === "availability") return "Continue";
    return "";
  })();

  const primaryDisabled = (() => {
    if (busy || configLoading) return true;
    if (accountPhase === "code") return otp.trim().length !== 6;
    if (currentStepId === "trades") return enabledIds.size === 0 || !primaryId || catalogLoading;
    if (currentStepId === "lead") return !leadValid;
    if (currentStepId === "rates") return ratesLoading || !!ratesError;
    if (currentStepId === "business") {
      if (showLegalType && isPartnerRegistrationFieldMandatory("legal_type", registrationFields) && !legalType) return true;
      if (showTaxId && isPartnerRegistrationFieldMandatory("tax_id", registrationFields) && !regNumber.trim()) return true;
      if (showVat && legalType === "limited_company") {
        if (isPartnerRegistrationFieldMandatory("vat", registrationFields) && vatRegistered === null) return true;
        if (vatRegistered === true && !vatNumber.trim()) return true;
      }
      return false;
    }
    if (currentStepId === "equipment") return hasOwnTools !== true || canSupplyMaterials !== true;
    if (currentStepId === "availability") return workDays.size === 0 || !(workStart < workEnd);
    if (currentStepId === "coverage") {
      return isPartnerRegistrationFieldMandatory("coverage", registrationFields) && !coveragePostcode.trim();
    }
    return false;
  })();

  // The code screen (an email that already has a login) sits over whatever
  // step asked for it.
  const view: GetStartedStepId | "code" = accountPhase === "code" ? "code" : currentStepId;
  const stepEyebrow = (label: string) => `Step ${step + 1} · ${label}`;

  const showFooter = view !== "documents" && view !== "agreements" && view !== "getting_ready";

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

          {view === "trades" && (
            <StepShell
              eyebrow={stepEyebrow("What you cover")}
              title="What work do you do?"
              subtitle="Pick the trades you offer from our platform catalogue. Choose one as your primary trade."
              status={`${enabledIds.size} trade${enabledIds.size === 1 ? "" : "s"} selected`}
            >
              {catalogLoading ? (
                <p style={{ color: T.mute, fontSize: 14 }}>Loading trades…</p>
              ) : catalog.length === 0 ? (
                <p style={{ color: T.mute, fontSize: 14 }}>No trades available right now.</p>
              ) : (
                <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "left", display: "grid", gap: 26 }}>
                  {catalogGroups.map((group) => (
                    <div key={group.label}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: T.mute,
                          marginBottom: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {group.label}
                        <span style={{ flex: 1, height: 1, background: T.line }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {group.items.map((c) => {
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
                    </div>
                  ))}
                </div>
              )}
            </StepShell>
          )}

          {view === "lead" && (
            <StepShell
              eyebrow={stepEyebrow("Your details")}
              title="Your details"
              subtitle="Name, email, phone and business address. The basics to get you set up."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 12 }}>
                <LightField label="Your name">
                  <LightInput value={fullName} onChange={setFullName} placeholder="Jordan Smith" autoFocus />
                </LightField>
                <LightField label="Company / trading name">
                  <LightInput value={company} onChange={setCompany} placeholder="Smith Maintenance Ltd" />
                </LightField>
                <LightField
                  label="Work email"
                  error={
                    emailMessage && (
                      <>
                        {emailMessage}
                        {emailSuggestion && (
                          <button
                            type="button"
                            onClick={() => {
                              setEmail(emailSuggestion);
                              setLeadFieldError(null);
                            }}
                            style={{ marginLeft: 8, padding: 0, border: "none", background: "transparent", color: T.coral, fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                          >
                            Use it
                          </button>
                        )}
                      </>
                    )
                  }
                >
                  <LightInput
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (leadFieldError?.field === "email") setLeadFieldError(null);
                    }}
                    onBlur={() => email.trim() && setTouched((t) => ({ ...t, email: true }))}
                    invalid={Boolean(emailMessage)}
                    placeholder="you@company.co.uk"
                    type="email"
                  />
                </LightField>
                {showPhone && (
                  <LightField label="Mobile number" error={phoneMessage}>
                    <LightInput
                      value={phone}
                      onChange={(v) => {
                        setPhone(v);
                        if (leadFieldError?.field === "phone") setLeadFieldError(null);
                      }}
                      onBlur={() => phone.trim() && setTouched((t) => ({ ...t, phone: true }))}
                      invalid={Boolean(phoneMessage)}
                      placeholder="07XXX XXXXXX"
                      type="tel"
                    />
                  </LightField>
                )}
                {showAddress && (
                  <LightField label="Business address">
                    <GetStartedAddressAutocomplete
                      value={partnerAddress}
                      onChange={setPartnerAddress}
                      placeholder="Start typing your address or postcode…"
                    />
                  </LightField>
                )}
                {accountExistsEmail && accountExistsEmail === email.trim().toLowerCase() && (
                  <div style={{ padding: 14, borderRadius: 12, background: T.paper, border: `1px solid ${T.line}`, display: "grid", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.ink }}>You already have a Fixfy account</p>
                    <p style={{ margin: 0, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
                      {accountExistsEmail} is already signed up. Sign in to see your jobs, or use a different email for a new profile.
                    </p>
                    <div>
                      <Button variant="primary" onClick={() => (window.location.href = `/login?email=${encodeURIComponent(accountExistsEmail)}`)}>
                        Sign in
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </StepShell>
          )}

          {view === "rates" && (
            <StepShell
              eyebrow={stepEyebrow("Your rates")}
              title="Your net per job"
              subtitle="What you receive after Fixfy's commission, shown on every offer before you accept. Keep our standard rates or set your own for each size, time and add-on."
            >
              <div style={{ maxWidth: 620, margin: "0 auto" }}>
                {ratesLoading ? (
                  <p style={{ color: T.mute, fontSize: 14 }}>Loading your rates…</p>
                ) : ratesError ? (
                  <p style={{ color: T.coral, fontSize: 14 }}>{ratesError}</p>
                ) : rateRows.length === 0 ? (
                  <p style={{ color: T.mute, fontSize: 14 }}>No rates to set for the trades you picked. Carry on.</p>
                ) : (
                  <RateCardEditor rows={rateRows} onChange={setRateRows} />
                )}
              </div>
            </StepShell>
          )}

          {view === "business" && (
            <StepShell
              eyebrow={stepEyebrow("Your business")}
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

          {view === "code" && (
            <StepShell
              eyebrow={
                resumeKind === "reactivate"
                  ? "Welcome back"
                  : resumeKind === "onboarding"
                    ? "Continue where you stopped"
                    : "Confirm your email"
              }
              title={resumeKind ? "Check your email to continue" : "Check your email"}
              subtitle={
                resumeKind === "reactivate"
                  ? `Your account was set inactive. Enter the 6-digit code we just sent to ${email}. We'll reactivate you and pick up onboarding.`
                  : resumeKind === "onboarding"
                    ? `We already have your onboarding on file. Enter the 6-digit code we just sent to ${email} and you'll skip straight to what's missing.`
                    : `We sent a 6-digit code to ${email}. Enter it to continue.`
              }
            >
              <div style={{ maxWidth: 380, margin: "6px auto 0", textAlign: "left" }}>
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
                    onClick={() => setEmailFix({ value: email, error: null, busy: false })}
                    style={{ background: "transparent", border: "none", color: T.slate, fontFamily: T.sans, fontSize: 13, cursor: "pointer", textAlign: "left", padding: 0 }}
                  >
                    Wrong email? <span style={{ color: T.coral, fontWeight: 600 }}>Change it</span>
                  </button>
                </div>
              </div>
            </StepShell>
          )}

          {emailFix && (
            <Modal title="Change your email" width={420} onClose={() => !emailFix.busy && setEmailFix(null)}>
              <div style={{ padding: 20, display: "grid", gap: 12, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 13.5, color: T.slate, lineHeight: 1.5 }}>
                  Use this address instead. Everything else you filled in stays as it is.
                </p>
                <LightField label="Email">
                  <LightInput
                    value={emailFix.value}
                    onChange={(v) => setEmailFix({ ...emailFix, value: v, error: null })}
                    placeholder="you@company.co.uk"
                    type="email"
                    autoFocus
                  />
                </LightField>
                {emailFix.error && <p style={{ margin: 0, fontSize: 13, color: T.coral }}>{emailFix.error}</p>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => setEmailFix(null)} disabled={emailFix.busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => void applyEmailFix()} disabled={emailFix.busy}>
                    {emailFix.busy ? "Saving…" : "Use this email"}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {view === "coverage" && (
            <StepShell
              eyebrow={stepEyebrow("Service area")}
              title="Where do you work?"
              subtitle="Set your base postcode and how far you're willing to travel for jobs."
            >
              <div style={{ maxWidth: 420, margin: "6px auto 0", textAlign: "left", display: "grid", gap: 16 }}>
                <LightField label="Base postcode">
                  <LightInput value={coveragePostcode} onChange={setCoveragePostcode} placeholder="e.g. SW11 1AA" autoFocus />
                </LightField>
                <LightField label={`Service radius: ${coverageRadius} miles`}>
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

          {view === "equipment" && (
            <StepShell
              eyebrow={stepEyebrow("Tools & materials")}
              title="Ready for the job?"
              subtitle="Every Fixfy partner turns up with their own kit and can pick up what the job needs."
            >
              <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 14, textAlign: "left" }}>
                <YesNoQuestion
                  question="Do you have all the tools and equipment for the work you do?"
                  hint="Power tools, ladders, hoover, mop, whatever your trade needs."
                  value={hasOwnTools}
                  onChange={setHasOwnTools}
                />
                <YesNoQuestion
                  question="Can you supply the materials a job needs?"
                  hint="Paint, fixings, fittings, cleaning products. Agreed with you on each job."
                  value={canSupplyMaterials}
                  onChange={setCanSupplyMaterials}
                />
                {(hasOwnTools === false || canSupplyMaterials === false) && (
                  <p style={{ margin: 0, padding: "12px 14px", borderRadius: 10, background: T.coralTint, color: T.coralPress, fontSize: 13, lineHeight: 1.5 }}>
                    Your own tools and being able to supply materials are essential to work with Fixfy. If that changes, come back and pick up where you left off.
                  </p>
                )}
              </div>
            </StepShell>
          )}

          {view === "availability" && (
            <StepShell
              eyebrow={stepEyebrow("Availability")}
              title="When can you work?"
              subtitle="We only send you jobs on these days and hours. You can add days off and change this any time in your portal."
            >
              <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 16, textAlign: "left" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {[
                    ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
                  ].map(([k, rotulo]) => {
                    const on = workDays.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWorkDays((prev) => { const n = new Set(prev); if (on) n.delete(k); else n.add(k); return n; })}
                        style={{ minWidth: 56, height: 40, borderRadius: 10, border: `1px solid ${on ? T.coral : T.line}`, background: on ? T.coralTint : T.white, color: on ? T.coralPress : T.slate, fontFamily: T.sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                      >
                        {rotulo}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, color: T.slate }}>From <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={{ height: 38, padding: "0 8px", borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: T.sans }} /></label>
                  <label style={{ fontSize: 13, color: T.slate }}>to <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} style={{ height: 38, padding: "0 8px", borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: T.sans }} /></label>
                </div>
                <label style={{ fontSize: 13, color: T.slate, textAlign: "center" }}>
                  Up to{" "}
                  <select value={workMax} onChange={(e) => setWorkMax(Number(e.target.value))} style={{ height: 36, borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: T.sans, padding: "0 6px" }}>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>{" "}
                  jobs a day
                </label>
              </div>
            </StepShell>
          )}

          {view === "documents" && (
            <DocumentsStep eyebrow={stepEyebrow("Your documents")} mandatory={documentsMandatory} onContinue={goNext} />
          )}
          {view === "agreements" && (
            <AgreementsStep
              eyebrow={stepEyebrow("Agreements")}
              mandatory={agreementsMandatory}
              signerDefault={fullName.trim()}
              vatDefault={{ registered: vatRegistered, number: vatNumber }}
              onFinish={() => {
                // Meta: cadastro completo, contratos assinados (só com o sim de cookies).
                trackOnce("CompleteRegistration");
                // Instead of going straight to the portal we advance to the
                // gamified "getting ready" step which auto-transitions into
                // the "how it works" summary before dropping the partner in.
                goNext();
              }}
            />
          )}
          {view === "getting_ready" && (
            <GettingReadyStep
              onDone={() => {
                if (typeof window !== "undefined") {
                  // Wizard done — drop the saved step so a future revisit
                  // doesn't re-enter the closing animation, then drop straight
                  // into the portal (which shows the "under review" banner).
                  window.localStorage.removeItem(DRAFT_STEP_STORAGE_KEY);
                  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
                  window.location.href = "/?submitted=1";
                }
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
            {(step > 0 || accountPhase === "code") && (
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

function DocumentsStep({ eyebrow, mandatory, onContinue }: { eyebrow: string; mandatory: boolean; onContinue: () => void }) {
  const { required, loadError, uploaded, markUploaded, missingMandatory } = useRequiredDocs();

  // Photo ID, public liability (min £1m) and the trade registration are needed
  // before any Platform Booking, so those three can't be skipped. The rest can
  // still wait for the review.
  const missingForBookings = (required ?? []).filter((d) => isPlatformBookingRequiredDoc(d) && !uploaded[d.id]);
  const total = mandatory ? (required ?? []).filter((d) => d.mandatory !== false).length : (required?.length ?? 0);
  const done = mandatory ? total - missingMandatory.length : Object.keys(uploaded).length;
  const allDone = required !== null && missingForBookings.length === 0 && (mandatory ? total === 0 || missingMandatory.length === 0 : true);
  // A checklist that fails to load must not trap them here: the accept gate on
  // the server still blocks bookings until these documents are on file.
  const canSkip = (required !== null && !allDone && missingForBookings.length === 0) || Boolean(loadError);

  return (
    <>
      <div style={{ fontFamily: T.mono, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.coralPress, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral }} />
        {eyebrow}
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>Upload what&apos;s required</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 480, margin: "0 auto", lineHeight: 1.5 }}>
        Photo ID, public liability insurance (at least £1m cover) and the registration or accreditation your trade needs are
        required before you can receive bookings. PDF or photo, up to 10 MB each.
      </p>
      <p style={{ fontSize: 14, color: T.mute, maxWidth: 480, margin: "10px auto 0", lineHeight: 1.5 }}>
        Your proof of address is the business address we show on your customers&apos; receipts.
        {mandatory ? " Anything else not to hand can wait: skip it now and upload it while we review." : " You can add more later in Settings."}
      </p>
      {total > 0 && (
        <p style={{ fontSize: 14, fontWeight: 600, color: allDone ? T.green : T.slate, marginTop: 16 }}>
          {done} of {total} uploaded
        </p>
      )}

      <div style={{ marginTop: 26, textAlign: "left", maxWidth: 560, marginInline: "auto" }}>
        <RequiredDocsList required={required} loadError={loadError} uploaded={uploaded} onUploaded={markUploaded} />
      </div>

      <div style={FOOTER_STYLE}>
        <div style={{ width: "100%", maxWidth: 420, display: "grid", gap: 10 }}>
          {canSkip && (
            <Button variant="secondary" size="lg" full onClick={onContinue}>
              Skip the rest for now
            </Button>
          )}
          <Button variant="primary" size="lg" full onClick={onContinue} disabled={!allDone} iconRight="arrow-right">
            {allDone
              ? "Continue to agreements"
              : missingForBookings.length > 0
                ? `${missingForBookings.length} required for bookings still to upload`
                : `Upload all documents (${done}/${total || "…"})`}
          </Button>
        </div>
      </div>
    </>
  );
}

function AgreementsStep({
  eyebrow,
  mandatory,
  signerDefault,
  vatDefault,
  onFinish,
}: {
  eyebrow: string;
  mandatory: boolean;
  signerDefault: string;
  /** What the business step already collected (limited companies). */
  vatDefault: VatStatusDraft;
  onFinish: () => void;
}) {
  const [contracts, setContracts] = useState<PartnerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(signerDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PartnerContract | null>(null);
  /** Per-contract consent — the checkbox next to each agreement row. */
  const [consented, setConsented] = useState<Record<string, boolean>>({});
  /** Annex 1 of the Invoicing and Payment Collection Agreement. */
  const [vat, setVat] = useState<VatStatusDraft>(vatDefault);

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
        if (!cancelled) setContracts(rows);
        // Best-effort: what's already on file (business step, or a resumed partner).
        try {
          const { data: vrow } = await supabase
            .from("partners")
            .select("vat_registered, vat_number")
            .eq("id", pid)
            .maybeSingle();
          const v = vrow as { vat_registered?: boolean | null; vat_number?: string | null } | null;
          if (!cancelled && typeof v?.vat_registered === "boolean") {
            const registered = v.vat_registered;
            setVat((prev) => (prev.registered === null ? { registered, number: v.vat_number?.trim() ?? "" } : prev));
          }
        } catch {
          /* the partner picks it below */
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

  // Render all three agreements even if one has no active DB version yet:
  // merge DB rows into a full slot list keyed by the constant. sign-all signs
  // every active version, so every one of them is listed for consent.
  const complianceContracts = useMemo<PartnerContract[]>(() => {
    const byType = new Map<string, PartnerContract>();
    for (const c of contracts) byType.set(c.type, c);
    return PARTNER_CONTRACT_SIGNING_ORDER.map((type) => {
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
  // The VAT line is part of the Invoicing and Payment Collection Agreement.
  const vatNeeded = unsigned.some((c) => c.type === INVOICING_CONTRACT_TYPE);
  const vatStatus = vatStatusFromDraft(vat);
  const canSubmit =
    !allSigned && allConsented && !!signerName.trim() && unsigned.length > 0 && (!vatNeeded || vatStatus !== null);

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
          vatStatus: vatStatus ?? undefined,
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
        {eyebrow}
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", margin: "0 0 12px", color: T.navy }}>Sign your agreements</h1>
      <p style={{ fontSize: 16, color: T.slate, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
        Joining Fixfy is free. One signature covers all three agreements and your VAT status. We&apos;ll review your
        application within 24 hours.
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
                            (draft: full text pending publication)
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
                {vatNeeded && <VatStatusField value={vat} onChange={setVat} disabled={busy} />}
                <LightField label="Full legal name">
                  <LightInput value={signerName} onChange={setSignerName} placeholder="As shown on your ID" />
                </LightField>
                <p style={{ margin: 0, fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
                  By ticking the boxes above and continuing you accept the agreements
                  {vatNeeded ? " and confirm your VAT status" : ""}. Your name, timestamp and IP address are recorded
                  for the audit trail. No drawn signature required.
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

function LightField({ label, error, children }: { label: string; error?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "block" }}>
      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.mute, marginBottom: 7 }}>{label}</span>
        {children}
      </label>
      {error ? <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.4, color: T.red }}>{error}</p> : null}
    </div>
  );
}

function LightInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  style,
  onBlur,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  style?: CSSProperties;
  onBlur?: () => void;
  invalid?: boolean;
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
      onBlur={() => {
        setFocus(false);
        onBlur?.();
      }}
      style={{
        width: "100%",
        height: 46,
        padding: "0 14px",
        borderRadius: 10,
        border: `1px solid ${invalid ? T.red : focus ? T.coral : T.lineStrong}`,
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
          Hold tight, we&apos;re syncing your profile with our platform.
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

function YesNoQuestion({
  question,
  hint,
  value,
  onChange,
}: {
  question: string;
  hint: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const option = (v: boolean, label: string) => {
    const on = value === v;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(v)}
        style={{
          flex: 1,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1.5px solid ${on ? (v ? T.coral : T.lineStrong) : T.line}`,
          background: on ? (v ? T.coralTint : T.paper2) : T.white,
          color: on ? (v ? T.coral : T.slate) : T.slate,
          fontFamily: T.sans,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${T.line}`, background: T.white }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{question}</div>
      <div style={{ fontSize: 12.5, color: T.mute, marginTop: 4, lineHeight: 1.45 }}>{hint}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {option(true, "Yes")}
        {option(false, "No")}
      </div>
    </div>
  );
}
