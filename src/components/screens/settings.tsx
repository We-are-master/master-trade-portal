"use client";

// Settings — 10 sub-pages with a left sub-nav. Ported from settings.jsx.
// Several pages (Trades, Service area, Availability, Rate card, Documents) are reused
// by the onboarding flow, so they're exported.

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { Avatar, Badge, Button, Card, Field, Icon, Input, Modal, Toggle } from "@/components/ui/primitives";
import { StripeMark } from "@/components/brand/stripe-mark";
import { ServiceAreaMap } from "@/components/ui/service-area-map";
import { SignaturePad } from "@/components/ui/signature-pad";
import { useToast } from "@/components/ui/toast";
import { PartnerRatingCard } from "@/components/ui/partner-rating";
import { usePartner } from "@/components/partner-context";
import { partnerBillingEnabled } from "@/lib/partner-work-access";
import { usePartnerRating } from "@/hooks/use-partner-rating";
import { createClient } from "@/lib/supabase/client";
import { formatGBPdec } from "@/lib/format";
import {
  exampleJobDate,
  fmtDay,
  fmtPayFriday,
  fmtRange,
  getYourNextPayment,
  upcomingPayments,
} from "@/lib/payment-schedule";
import { SERVICE_CATEGORY_ORDER, serviceCategory } from "@/lib/service-category";
import { fetchSelfBills, type SelfBill } from "@/lib/queries/self-bills";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import { missingFromChecklist, pickRequiredDocMatch, type RequiredDocDef } from "@/lib/partner-required-docs";
import { hydrateContractHtml } from "@/lib/contract-branding";
import { fetchContracts, type PartnerContract } from "@/lib/queries/contracts";
import { fetchRateCard, saveRateCard, type ServicePrice } from "@/lib/queries/rate-card";
import { formatCatalogPartnerPay } from "@/lib/catalog-partner-pay";
import { servicePricingLabel } from "@/lib/pricing-mode-labels";
import { useRegisterOnboardingSave, useIsOnboarding } from "@/components/onboarding-save";
import {
  fetchPartnerSettings,
  savePartnerSettings,
  DAYS,
  NOTIFICATION_EVENTS,
  type Availability,
  type DayKey,
  type JobPreferences,
  type NotificationPrefs,
} from "@/lib/queries/partner-settings";
import { openBillingPortal, startCheckout } from "@/lib/billing";
import { getPlan, type PlanId } from "@/lib/plan-catalog";
import { PlanPickerGrid, PlanSummaryCard } from "@/components/billing/plan-summary-card";
import { OnboardingPaymentStep } from "@/components/billing/onboarding-payment-step";

export interface SettingsPage {
  id: string;
  label: string;
  icon: string;
}

export const SETTINGS_PAGES: SettingsPage[] = [
  { id: "profile", label: "Profile", icon: "user" },
  { id: "trades", label: "Trades & skills", icon: "wrench" },
  { id: "rates", label: "Rate card", icon: "banknote" },
  { id: "availability", label: "Availability", icon: "calendar-clock" },
  { id: "area", label: "Service area", icon: "map-pin" },
  { id: "preferences", label: "Job preferences", icon: "sliders-horizontal" },
  { id: "billing", label: "Billing & plan", icon: "credit-card" },
  { id: "selfbill", label: "Self-bill", icon: "receipt" },
  { id: "docs", label: "Documents", icon: "shield-check" },
  { id: "policies", label: "Policies", icon: "gavel" },
];

export function settingsPageLabel(id: string): string {
  return SETTINGS_PAGES.find((x) => x.id === id)?.label ?? id;
}

export function SettingsView({ initial = "profile" }: { initial?: string }) {
  const partner = usePartner();
  const billingEnabled = partnerBillingEnabled(partner);
  // Free / un-tiered partners: no "Billing & plan" tab at all.
  const pages = billingEnabled ? SETTINGS_PAGES : SETTINGS_PAGES.filter((p) => p.id !== "billing");
  const safeInitial = initial === "billing" && !billingEnabled ? "profile" : initial;
  const [page, setPage] = useState(safeInitial);
  useEffect(() => {
    setPage(safeInitial);
  }, [safeInitial]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1, overflow: "hidden" }}>
      {/* Sub-nav */}
      <div style={{ borderRight: `1px solid ${T.line}`, padding: 16, overflow: "auto", background: T.white }}>
        <div style={{ fontSize: 11, letterSpacing: 0.5, color: T.mute, fontWeight: 500, textTransform: "uppercase", padding: "0 10px 8px" }}>
          Settings
        </div>
        {pages.map((p) => {
          const sel = p.id === page;
          return (
            <div
              key={p.id}
              onClick={() => setPage(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                background: sel ? T.paper : "transparent",
                color: sel ? T.navy : T.slate,
                fontSize: 13,
                fontWeight: sel ? 500 : 400,
              }}
            >
              <Icon name={p.icon} size={14} color={sel ? T.navy : T.mute} />
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {page === "profile" && <ProfilePage />}
        {page === "trades" && <TradesPage />}
        {page === "rates" && <RatesPage />}
        {page === "availability" && <AvailabilityPage />}
        {page === "area" && <ServiceAreaPage />}
        {page === "preferences" && <PreferencesPage />}
        {page === "billing" && billingEnabled && <BillingPage />}
        {page === "selfbill" && <SelfBillPage />}
        {page === "docs" && <DocsPage />}
        {page === "policies" && <PoliciesPage />}
      </div>
    </div>
  );
}

export function SettingsHeader({ title, subtitle, saved = false }: { title: string; subtitle?: string; saved?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 18 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: T.navy }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {saved && (
        <Badge tone="success" icon="check" size="md">
          Saved 2 min ago
        </Badge>
      )}
    </div>
  );
}

export function PageCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.navy }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: T.mute, marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </Card>
  );
}

export function Row({
  label,
  hint,
  children,
  columns = "180px 1fr",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  columns?: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: columns, gap: 16, alignItems: "flex-start", padding: "10px 0" }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: T.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Toggle on={on} onChange={onChange} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ---------- PROFILE ----------
// Persists the real partners columns: contact_name (Name), phone, company_name (Trading name),
// bio and years_experience (migration 204). DOB/company number/VAT number have no column yet.
function ProfilePage() {
  const partner = usePartner();
  const { rating, complaintCount, pointsLost, topComplaints, loaded: ratingLoaded } = usePartnerRating(partner.rating);
  const toast = useToast();
  const initial = {
    firstName: partner.firstName,
    lastName: partner.lastName,
    phone: partner.phone,
    tradingName: partner.tradingName,
    bio: partner.bio ?? "",
    years: partner.yearsExperience ? String(partner.yearsExperience) : "",
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const contactName = `${form.firstName} ${form.lastName}`.trim();
      const years = form.years.trim() === "" ? null : Number(form.years.replace(/\D/g, "")) || null;
      const supabase = createClient();
      const { error } = await supabase
        .from("partners")
        .update({
          contact_name: contactName,
          phone: form.phone || null,
          company_name: form.tradingName || null,
          bio: form.bio || null,
          years_experience: years,
        })
        .eq("id", partner.id);
      if (error) throw error;
      toast({ text: "Profile saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save profile", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsHeader title="Profile" subtitle="What customers see on your job reports." />
      {ratingLoaded && (
        <PartnerRatingCard rating={rating} complaintCount={complaintCount} pointsLost={pointsLost} topComplaints={topComplaints} />
      )}
      <PageCard title="About you">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <Avatar initials={partner.initials} size={72} bg={T.navy} />
          <div>
            <Button variant="secondary" size="sm" icon="camera">Upload Logo</Button>
            <div style={{ fontSize: 11.5, color: T.mute, marginTop: 6 }}>PNG or JPG, 800×800 minimum</div>
          </div>
        </div>
        <Row label="Name">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input value={form.firstName} onChange={set("firstName")} placeholder="First" />
            <Input value={form.lastName} onChange={set("lastName")} placeholder="Last" />
          </div>
        </Row>
        <Row label="Email" hint="Verified — used for sign-in">
          <Input value={partner.email} icon="mail" suffix={<Badge tone="success" size="sm" icon="check">Verified</Badge>} />
        </Row>
        <Row label="Phone" hint="SMS for emergency jobs only">
          <Input value={form.phone} onChange={set("phone")} icon="phone" placeholder="07…" />
        </Row>
        <Row label="Trading name" hint="Sole trader name OR limited company name">
          <Input value={form.tradingName} onChange={set("tradingName")} />
        </Row>
        <Row label="Years experience">
          <Input value={form.years} onChange={set("years")} placeholder="e.g. 12" suffix="years" />
        </Row>
        <Row label="Public bio" hint="Shows on customer-facing reports">
          <textarea
            value={form.bio}
            onChange={(e) => set("bio")(e.target.value)}
            placeholder="A short intro customers see on your job reports."
            style={{
              width: "100%",
              minHeight: 80,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              fontFamily: T.sans,
              fontSize: 13,
              color: T.ink,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </Row>
      </PageCard>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={() => setForm(initial)} disabled={!dirty || saving}>
          Cancel
        </Button>
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </>
  );
}

// ---------- TRADES & SKILLS ----------
// Trades are the OS service_catalog services the partner offers. One is "primary"
// (the headline trade). Persists to partners.{trades, trade, catalog_service_ids}.
interface CatalogTrade {
  id: string;
  name: string;
}

export function TradesPage() {
  const partner = usePartner();
  const toast = useToast();
  const router = useRouter();
  const inOnboarding = useIsOnboarding();
  const [catalog, setCatalog] = useState<CatalogTrade[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const [{ data: cats }, { data: prow }] = await Promise.all([
        supabase.from("service_catalog").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
        supabase.from("partners").select("catalog_service_ids, trade, trades").eq("id", partner.id).maybeSingle(),
      ]);
      if (!alive) return;
      const list = ((cats ?? []) as { id: string; name: string | null }[]).map((c) => ({ id: c.id, name: c.name || "Service" }));
      setCatalog(list);
      const p = prow as { catalog_service_ids?: string[] | null; trade?: string | null; trades?: string[] | null } | null;
      // Prefill enabled from catalog_service_ids; fall back to matching stored trade names.
      const ids = new Set<string>();
      if (p?.catalog_service_ids?.length) {
        for (const id of p.catalog_service_ids) if (list.some((c) => c.id === id)) ids.add(id);
      } else if (!inOnboarding && p?.trades?.length) {
        for (const c of list) if (p.trades.includes(c.name)) ids.add(c.id);
      }
      setEnabledIds(ids);
      const primaryByName = p?.trade ? list.find((c) => c.name === p.trade)?.id : undefined;
      setPrimaryId(primaryByName ?? (ids.size ? [...ids][0] : null));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [partner.id, inOnboarding]);

  const toggle = (id: string) => {
    setDirty(true);
    const wasOn = enabledIds.has(id);
    const next = new Set(enabledIds);
    if (wasOn) next.delete(id);
    else next.add(id);
    setEnabledIds(next);
    if (wasOn && primaryId === id) setPrimaryId(next.size ? [...next][0] : null);
    if (!wasOn && !primaryId) setPrimaryId(id);
  };

  const makePrimary = (id: string) => {
    setDirty(true);
    if (!enabledIds.has(id)) setEnabledIds(new Set(enabledIds).add(id));
    setPrimaryId(id);
  };

  const renderTradeCard = (c: CatalogTrade) => {
    const on = enabledIds.has(c.id);
    const isPrimary = on && c.id === primaryId;
    return (
      <div
        key={c.id}
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${isPrimary ? T.coral : on ? T.line : T.line}`,
          background: on ? T.white : T.paper,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: on ? T.ink : T.slate, flex: 1 }}>{c.name}</span>
          {isPrimary && <Badge tone="coral" size="sm">Primary</Badge>}
          <Toggle on={on} onChange={() => toggle(c.id)} />
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
  };

  const save = async (): Promise<boolean> => {
    if (enabledIds.size === 0) {
      toast({ text: "Enable at least one trade.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    const primary = primaryId && enabledIds.has(primaryId) ? primaryId : [...enabledIds][0];
    setSaving(true);
    try {
      const ids = [...enabledIds];
      const names = ids.map((id) => catalog.find((c) => c.id === id)?.name).filter(Boolean) as string[];
      const primaryName = catalog.find((c) => c.id === primary)?.name ?? names[0];
      // Primary first in trades[] — the same denormalisation the OS uses.
      const trades = [primaryName, ...names.filter((n) => n !== primaryName)];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("partners")
        .update({ trades, trade: primaryName, catalog_service_ids: ids })
        .eq("id", partner.id)
        .select("id");
      if (error) throw error;
      // RLS-scoped UPDATE that matches 0 rows returns no error but no data — surface it.
      if (!data || data.length === 0) {
        throw new Error("Save was blocked. Make sure migration 198 is applied (partner self-update RLS).");
      }
      toast({ text: "Trades saved", icon: "check" });
      setDirty(false);
      // Don't refresh during onboarding — it re-runs the server page and closes the modal.
      if (!inOnboarding) router.refresh();
      return true;
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save trades", icon: "alert-triangle", tone: "coral" });
      return false;
    } finally {
      setSaving(false);
    }
  };
  useRegisterOnboardingSave(save); // onboarding "Continue" saves trades automatically

  return (
    <>
      {!inOnboarding && (
        <SettingsHeader title="Trades & skills" subtitle="The services you offer. Pick the ones you do and set one as your primary — we only send work matching your enabled trades." />
      )}
      <PageCard title="Your services" subtitle="All off by default — turn on only what you offer. Pick one as your primary trade.">
        {loading ? (
          <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="loader" size={14} color={T.mute} /> Loading services…
          </div>
        ) : catalog.length === 0 ? (
          <div style={{ fontSize: 13, color: T.mute }}>No services published yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {SERVICE_CATEGORY_ORDER.map((cat) => {
              const catItems = catalog.filter((c) => serviceCategory(c.name) === cat);
              if (catItems.length === 0) return null;
              return (
                <div key={cat}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: T.navy, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>{catItems.map(renderTradeCard)}</div>
                </div>
              );
            })}
          </div>
        )}
      </PageCard>
      {!inOnboarding && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving || loading}>
            {saving ? "Saving…" : "Save trades"}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- RATE CARD ----------
// Real per-service pricing: partner_service_prices joined to service_catalog. Each service is
// either the catalog standard cost (use_standard) or the partner's own override.
export function RatesPage() {
  const partner = usePartner();
  const toast = useToast();
  const inOnboarding = useIsOnboarding();
  const [rows, setRows] = useState<ServicePrice[]>([]);
  const [initial, setInitial] = useState<ServicePrice[]>([]);
  const [tradeCount, setTradeCount] = useState<number>(partner.trades.length);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState<Set<string>>(new Set());

  const toggleExtras = (catalogServiceId: string) => {
    setExtrasOpen((prev) => {
      const next = new Set(prev);
      if (next.has(catalogServiceId)) next.delete(catalogServiceId);
      else next.add(catalogServiceId);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        // Read trades from the DB — the partner context can be stale mid-onboarding
        // (trades were just saved in the Trades step but the context hasn't refreshed).
        const { data: prow } = await supabase.from("partners").select("trades").eq("id", partner.id).maybeSingle();
        const trades = ((prow as { trades?: string[] | null } | null)?.trades ?? partner.trades) ?? [];
        const data = await fetchRateCard(supabase, partner.id, trades);
        const normalized = inOnboarding ? data.map((r) => ({ ...r, useStandard: true })) : data;
        if (!cancelled) {
          setRows(normalized);
          setInitial(normalized);
          setTradeCount(trades.length);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load rate card");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // partner.trades drives which services show — re-fetch when they change
  }, [partner.id, partner.trades, inOnboarding]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const update = (catalogServiceId: string, patch: Partial<ServicePrice>) =>
    setRows((prev) => prev.map((r) => (r.catalogServiceId === catalogServiceId ? { ...r, ...patch } : r)));
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(/[^0-9.]/g, "")) || 0);
  // Partner can undercut catalog pay but never exceed the catalog ceiling.
  const clampTo = (v: number | null, ceiling: number): number | null => (v == null ? null : Math.min(Math.max(0, v), ceiling));

  const save = async () => {
    setSaving(true);
    try {
      const clamped = rows.map((r) => ({
        ...r,
        fixedPartnerCost: clampTo(r.fixedPartnerCost, r.standardPayFixed),
        hourlyPartnerRate: clampTo(r.hourlyPartnerRate, r.standardPayHourly),
      }));
      await saveRateCard(createClient(), partner.id, clamped);
      setInitial(clamped);
      setRows(clamped);
      toast({ text: "Rate card saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save rate card", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  useRegisterOnboardingSave(save); // Continue saves the rate card automatically

  const renderServiceRow = (r: ServicePrice) => {
    const pay = formatCatalogPartnerPay(r.mode, r.standardPayFixed, r.standardHours, r.name, formatGBPdec);
    const payCeiling = r.mode === "hourly" ? r.standardPayHourly : r.standardPayFixed;
    const current = r.mode === "hourly" ? r.hourlyPartnerRate : r.fixedPartnerCost;
    const aboveStandard = !r.useStandard && current != null && current > payCeiling;

    return (
      <div key={r.catalogServiceId} style={{ padding: 12, border: `1px solid ${T.line}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{r.name}</div>
            <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
              {servicePricingLabel(r.mode, r.name)} · <span className="fx-mono">{pay}</span>
            </div>
          </div>
          <span style={{ fontSize: 12, color: T.slate }}>Use standard</span>
          <Toggle on={r.useStandard} onChange={(v) => update(r.catalogServiceId, { useStandard: v })} />
        </div>
        {!r.useStandard && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 2 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {r.mode === "hourly" ? (
                <>
                  <Input
                    value={r.hourlyPartnerRate != null ? String(r.hourlyPartnerRate) : ""}
                    onChange={(v) => update(r.catalogServiceId, { hourlyPartnerRate: num(v) })}
                    prefix="£"
                    suffix="/hr"
                    placeholder={String(r.standardPayHourly)}
                    style={{ width: 160 }}
                  />
                  <Input
                    value={r.defaultHours != null ? String(r.defaultHours) : ""}
                    onChange={(v) => update(r.catalogServiceId, { defaultHours: num(v) })}
                    suffix="hrs"
                    placeholder={String(r.standardHours)}
                    style={{ width: 120 }}
                  />
                </>
              ) : (
                <Input
                  value={r.fixedPartnerCost != null ? String(r.fixedPartnerCost) : ""}
                  onChange={(v) => update(r.catalogServiceId, { fixedPartnerCost: num(v) })}
                  prefix="£"
                  placeholder={String(r.standardPayFixed)}
                  style={{ width: 180 }}
                />
              )}
            </div>
            {aboveStandard && (
              <div style={{ fontSize: 11, color: T.coral, lineHeight: 1.45 }}>
                That&apos;s above the catalog standard pay of{" "}
                <span className="fx-mono">{r.mode === "hourly" ? `${formatGBPdec(r.standardPayHourly)}/hr` : formatGBPdec(r.standardPayFixed)}</span>
                {" "}— we can&apos;t match pre-paid jobs at that rate right now.
              </div>
            )}
          </div>
        )}
        {(r.bands.length > 0 || r.addons.length > 0) && (
          <div style={{ paddingTop: 8, borderTop: `1px dashed ${T.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.slate, fontFamily: T.mono, letterSpacing: 0.3 }}>+ EXTRAS</span>
              <button
                type="button"
                onClick={() => toggleExtras(r.catalogServiceId)}
                title={extrasOpen.has(r.catalogServiceId) ? "Hide standard prices" : "View standard band and add-on prices"}
                aria-expanded={extrasOpen.has(r.catalogServiceId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  padding: 0,
                  border: `1px solid ${T.line}`,
                  borderRadius: 9999,
                  background: extrasOpen.has(r.catalogServiceId) ? T.coralTint : T.white,
                  cursor: "pointer",
                }}
              >
                <Icon name="info" size={13} color={extrasOpen.has(r.catalogServiceId) ? T.coral : T.mute} />
              </button>
            </div>
            {extrasOpen.has(r.catalogServiceId) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {r.bands.map((b) => (
                  <span key={`b-${b.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", background: T.paper2, color: T.slate, borderRadius: 6, fontSize: 11 }}>
                    <Icon name="layers" size={11} color={T.mute} />
                    {b.label}
                    {b.partner_cost != null && <span className="fx-mono">· {formatGBPdec(b.partner_cost)}</span>}
                  </span>
                ))}
                {r.addons.map((a) => (
                  <span key={`a-${a.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", background: T.paper2, color: T.slate, borderRadius: 6, fontSize: 11 }}>
                    <Icon name="plus" size={11} color={T.mute} />
                    {a.label}
                    {a.partner_cost != null && <span className="fx-mono">· {formatGBPdec(a.partner_cost)}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {!inOnboarding && <SettingsHeader title="Rate card" subtitle="What Fixfy pays you per service — from the catalog standard or your own rate below the ceiling." />}
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading rate card…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 ? (
        <PageCard title="Services">
          <div style={{ fontSize: 13, color: T.mute }}>
            {tradeCount === 0
              ? "Add your trades first (Trades & skills) — the matching services then appear here to price."
              : "No catalog services match your trades yet. Once Fixfy has services for your trades, they'll appear here."}
          </div>
        </PageCard>
      ) : (
        <>
          <PageCard title="Your services" subtitle="Standard pay comes from the Fixfy catalog. Toggle off to set your own rate — it can't go above the catalog ceiling.">
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 10,
                background: T.green50,
                border: `1px solid rgba(14, 138, 95, 0.22)`,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: T.white, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="trending-up" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.green }}>Using our standard price</div>
                <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, lineHeight: 1.45 }}>
                  Your chance of being chosen for pre-paid jobs is <b style={{ color: T.ink }}>76% higher</b>.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {SERVICE_CATEGORY_ORDER.map((cat) => {
                const catRows = rows.filter((r) => serviceCategory(r.name) === cat);
                if (catRows.length === 0) return null;
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: T.navy, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                    {cat === "Trades" && (
                      <div
                        style={{
                          marginBottom: 10,
                          padding: "12px 14px",
                          borderRadius: 10,
                          background: T.paper2,
                          border: `1px solid ${T.line}`,
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: T.white, color: T.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon name="clock" size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Call Out = 1-3 Hour Visit</div>
                          <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, lineHeight: 1.45 }}>
                            If you can finish the job within 1-3 hours, good. If it needs longer, put together a quote and send it to us and we will get it approved as soon as possible.
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{catRows.map(renderServiceRow)}</div>
                  </div>
                );
              })}
            </div>
          </PageCard>
          {!inOnboarding && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setRows(initial)} disabled={!dirty || saving}>
                Cancel
              </Button>
              <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save rate card"}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------- AVAILABILITY ----------
export function AvailabilityPage() {
  const partner = usePartner();
  const toast = useToast();
  const inOnboarding = useIsOnboarding();
  const [av, setAv] = useState<Availability | null>(null);
  const [initial, setInitial] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await fetchPartnerSettings(createClient(), partner.id);
        if (!cancelled) {
          setAv(s.availability);
          setInitial(s.availability);
        }
      } catch {
        /* defaults applied by fetch on success; on error leave null → loading guard */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const dirty = !!av && JSON.stringify(av) !== JSON.stringify(initial);
  const setDay = (key: DayKey, patch: Partial<{ on: boolean; start: string; end: string }>) =>
    setAv((a) => (a ? { ...a, days: { ...a.days, [key]: { ...a.days[key], ...patch } } } : a));

  const save = async () => {
    if (!av) return;
    setSaving(true);
    try {
      await savePartnerSettings(createClient(), partner.id, { availability: av });
      setInitial(av);
      toast({ text: "Availability saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save availability", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };
  useRegisterOnboardingSave(save); // Continue saves availability automatically (before any early return — Rules of Hooks)

  if (loading || !av) {
    return (
      <>
        <SettingsHeader title="Availability" subtitle="When you're working. We only dispatch within these windows." />
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading availability…
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsHeader title="Availability" subtitle="When you're working. We only dispatch within these windows." />
      <PageCard title="Working hours">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DAYS.map(({ key, label }) => {
            const d = av.days[key];
            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 110px 110px",
                  gap: 12,
                  alignItems: "center",
                  padding: "8px 12px",
                  background: d.on ? T.white : T.paper,
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: d.on ? T.ink : T.mute }}>{label}</div>
                <Toggle on={d.on} onChange={(v) => setDay(key, { on: v })} label={d.on ? "Available" : "Day off"} />
                <Input value={d.start} onChange={(v) => setDay(key, { start: v })} icon="clock" size="sm" />
                <Input value={d.end} onChange={(v) => setDay(key, { end: v })} icon="clock" size="sm" />
              </div>
            );
          })}
        </div>
      </PageCard>

      <PageCard title="Defaults & breaks">
        <Row label="Buffer between jobs">
          <Input value={String(av.bufferMins)} onChange={(v) => setAv((a) => (a ? { ...a, bufferMins: Number(v.replace(/\D/g, "")) || 0 } : a))} suffix="min" />
        </Row>
        <Row label="Max jobs per day">
          <Input value={String(av.maxJobsPerDay)} onChange={(v) => setAv((a) => (a ? { ...a, maxJobsPerDay: Number(v.replace(/\D/g, "")) || 0 } : a))} suffix="jobs" />
        </Row>
        <Row label="Lunch window">
          <div style={{ display: "flex", gap: 8 }}>
            <Input value={av.lunch.start} onChange={(v) => setAv((a) => (a ? { ...a, lunch: { ...a.lunch, start: v } } : a))} style={{ flex: 1 }} />
            <Input value={av.lunch.end} onChange={(v) => setAv((a) => (a ? { ...a, lunch: { ...a.lunch, end: v } } : a))} style={{ flex: 1 }} />
          </div>
        </Row>
        <Row label="24/7 emergency call-outs" hint="50% surcharge applied">
          <Toggle on={av.emergency247} onChange={(v) => setAv((a) => (a ? { ...a, emergency247: v } : a))} />
        </Row>
      </PageCard>

      {!inOnboarding && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setAv(initial)} disabled={!dirty || saving}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save availability"}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- SERVICE AREA ----------
type CoverageMode = "radius" | "postcodes";

export function ServiceAreaPage() {
  const partner = usePartner();
  const toast = useToast();
  const inOnboarding = useIsOnboarding();
  const [mode, setMode] = useState<CoverageMode>("radius");
  const [postcode, setPostcode] = useState(partner.postcode);
  const [radius, setRadius] = useState(partner.radiusMiles || 10);
  const [excluded, setExcluded] = useState((partner.excludedPostcodes ?? []).join(", "));
  const [included, setIncluded] = useState<string[]>([]);
  const [pcInput, setPcInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Prefill coverage mode + postcode list (not in the partner context).
  useEffect(() => {
    let alive = true;
    void createClient()
      .from("partners")
      .select("coverage_mode, included_postcodes, coverage_base_postcode")
      .eq("id", partner.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const d = data as { coverage_mode?: string | null; included_postcodes?: string[] | null; coverage_base_postcode?: string | null };
        if (d.coverage_mode === "postcodes") setMode("postcodes");
        if (d.included_postcodes?.length) setIncluded(d.included_postcodes);
        if (d.coverage_base_postcode && !partner.postcode) setPostcode(d.coverage_base_postcode);
      });
    return () => {
      alive = false;
    };
  }, [partner.id, partner.postcode]);

  const setModeDirty = (m: CoverageMode) => {
    setMode(m);
    setDirty(true);
  };
  const addPostcode = () => {
    const code = pcInput.trim().toUpperCase().replace(/\s+/g, "");
    if (!code) return;
    if (!included.includes(code)) {
      setIncluded((p) => [...p, code]);
      setDirty(true);
    }
    setPcInput("");
  };
  const removePostcode = (code: string) => {
    setIncluded((p) => p.filter((c) => c !== code));
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    if (mode === "postcodes" && included.length === 0) {
      toast({ text: "Add at least one postcode area you cover.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    setSaving(true);
    try {
      if (mode === "radius") {
        const res = await fetch("/api/partner/onboarding-coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode: postcode.trim(), radiusMiles: radius }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error || "Couldn't save service area.");
      } else {
        const excludedArr = excluded.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
        const patch = {
          location: postcode.trim(),
          coverage_mode: "postcodes",
          included_postcodes: included,
          excluded_postcodes: excludedArr,
          service_radius_miles: null,
          coverage_latitude: null,
          coverage_longitude: null,
          coverage_base_postcode: null,
        };
        const { error } = await createClient().from("partners").update(patch).eq("id", partner.id);
        if (error) throw error;
      }
      setDirty(false);
      toast({ text: "Service area saved", icon: "check" });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
      toast({ text: msg || "Couldn't save service area", icon: "alert-triangle", tone: "coral" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useRegisterOnboardingSave(save); // Continue saves the service area automatically

  return (
    <>
      {!inOnboarding && <SettingsHeader title="Service area" subtitle="Where you work. Cover by distance from a base postcode, or list the exact postcode areas you take." />}
      <PageCard title="Coverage">
        {/* Mode toggle */}
        <div style={{ display: "inline-flex", gap: 6, background: T.paper2, padding: 3, borderRadius: 10, marginBottom: 14 }}>
          {([["radius", "By distance (miles)"], ["postcodes", "By postcode areas"]] as const).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => setModeDirty(v)}
              style={{
                padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: mode === v ? T.white : "transparent", color: mode === v ? T.navy : T.slate,
                boxShadow: mode === v ? "0 1px 2px rgba(2,0,64,0.12)" : "none",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {mode === "radius" ? (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Row label="Base postcode" columns="1fr">
                <Input value={postcode} onChange={(v) => { setPostcode(v); setDirty(true); }} icon="map-pin" placeholder="e.g. SW11 4PG" />
              </Row>
              <Row label="Radius" columns="1fr">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={radius}
                    onChange={(e) => { setRadius(Number(e.target.value)); setDirty(true); }}
                    style={{ flex: 1, accentColor: T.coral }}
                  />
                  <span className="fx-mono" style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{radius} mi</span>
                </div>
              </Row>
              <Row label="Excluded postcodes" hint="Comma-separated" columns="1fr">
                <Input value={excluded} onChange={(v) => { setExcluded(v); setDirty(true); }} placeholder="e.g. SE1, E14" />
              </Row>
            </div>
            <div style={{ position: "relative" }}>
              <ServiceAreaMap postcode={postcode} radiusMiles={radius} minHeight={320} />
              {postcode && (
                <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1, padding: "8px 12px", background: T.white, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11.5, color: T.slate, lineHeight: 1.5 }}>
                  <div><b>{postcode}</b> · {radius} mi radius</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
            <Row label="Add postcode areas" hint="Outward codes only, e.g. SW11, E14, BR1" columns="1fr">
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  value={pcInput}
                  onChange={setPcInput}
                  icon="map-pin"
                  placeholder="e.g. SW11"
                  style={{ flex: 1 }}
                />
                <Button variant="secondary" icon="plus" onClick={addPostcode}>Add</Button>
              </div>
            </Row>
            {included.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {included.map((code) => (
                  <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: T.coralTint, color: T.coral, borderRadius: 9999, fontSize: 12.5, fontWeight: 500, fontFamily: T.mono }}>
                    {code}
                    <button onClick={() => removePostcode(code)} style={{ padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", color: T.coral }} aria-label={`Remove ${code}`}>
                      <Icon name="x" size={12} color={T.coral} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: T.mute }}>No areas added yet — add the postcode districts you cover.</div>
            )}
            <Row label="Excluded postcodes" hint="Comma-separated" columns="1fr">
              <Input value={excluded} onChange={(v) => { setExcluded(v); setDirty(true); }} placeholder="e.g. SE1, E14" />
            </Row>
          </div>
        )}
      </PageCard>
      {!inOnboarding && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save service area"}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- PREFERENCES ----------
function PreferencesPage() {
  const partner = usePartner();
  const toast = useToast();
  const [prefs, setPrefs] = useState<JobPreferences | null>(null);
  const [notif, setNotif] = useState<NotificationPrefs | null>(null);
  const [initial, setInitial] = useState<{ prefs: JobPreferences; notif: NotificationPrefs } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await fetchPartnerSettings(createClient(), partner.id);
        if (!cancelled) {
          setPrefs(s.jobPreferences);
          setNotif(s.notificationPrefs);
          setInitial({ prefs: s.jobPreferences, notif: s.notificationPrefs });
        }
      } catch {
        /* ignore — guarded below */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const dirty = !!prefs && !!notif && !!initial && JSON.stringify({ prefs, notif }) !== JSON.stringify(initial);
  const setPref = (patch: Partial<JobPreferences>) => setPrefs((p) => (p ? { ...p, ...patch } : p));
  const setChannel = (event: string, ch: "email" | "push" | "sms", v: boolean) =>
    setNotif((n) => (n ? { ...n, [event]: { ...n[event], [ch]: v } } : n));

  const save = async () => {
    if (!prefs || !notif) return;
    setSaving(true);
    try {
      await savePartnerSettings(createClient(), partner.id, { job_preferences: prefs, notification_prefs: notif });
      setInitial({ prefs, notif });
      toast({ text: "Preferences saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save preferences", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs || !notif) {
    return (
      <>
        <SettingsHeader title="Job preferences" subtitle="The kinds of work you want — and don't." />
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading preferences…
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsHeader title="Job preferences" subtitle="The kinds of work you want — and don't." />
      <PageCard title="What you accept">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ToggleRow on={prefs.receiveLeads} onChange={(v) => setPref({ receiveLeads: v })} label="Receive leads" hint="Customer enquiries Fixfy hasn't quoted" />
          <ToggleRow on={prefs.receiveEmergency} onChange={(v) => setPref({ receiveEmergency: v })} label="Receive emergency call-outs" hint="Out-of-hours, urgent. 50% surcharge applies" />
          <ToggleRow on={prefs.receiveMultiDay} onChange={(v) => setPref({ receiveMultiDay: v })} label="Receive multi-day jobs (3+ days)" />
          <ToggleRow on={prefs.insuranceOnly} onChange={(v) => setPref({ insuranceOnly: v })} label="Insurance / claim work only" />
        </div>
      </PageCard>
      <PageCard title="Limits">
        <Row label="Minimum job value">
          <Input value={String(prefs.minJobValue)} onChange={(v) => setPref({ minJobValue: Number(v.replace(/\D/g, "")) || 0 })} prefix="£" />
        </Row>
        <Row label="Max simultaneous active jobs">
          <Input value={String(prefs.maxActiveJobs)} onChange={(v) => setPref({ maxActiveJobs: Number(v.replace(/\D/g, "")) || 0 })} suffix="jobs" />
        </Row>
      </PageCard>
      <PageCard title="Notifications">
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Event", "Email", "Push", "SMS"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: 0.4, color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.line}`, textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((e) => {
                const ch = notif[e.key] ?? { email: false, push: false, sms: false };
                return (
                  <tr key={e.key} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "12px", fontSize: 13, color: T.ink }}>{e.label}</td>
                    <td style={{ padding: "8px 12px" }}><Toggle on={ch.email} onChange={(v) => setChannel(e.key, "email", v)} /></td>
                    <td style={{ padding: "8px 12px" }}><Toggle on={ch.push} onChange={(v) => setChannel(e.key, "push", v)} /></td>
                    <td style={{ padding: "8px 12px" }}><Toggle on={ch.sms} onChange={(v) => setChannel(e.key, "sms", v)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageCard>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          variant="ghost"
          onClick={() => {
            if (initial) {
              setPrefs(initial.prefs);
              setNotif(initial.notif);
            }
          }}
          disabled={!dirty || saving}
        >
          Cancel
        </Button>
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </>
  );
}

// ---------- BILLING & PLAN ----------
interface SubInfo {
  subscription_status: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}
function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

const PRO_FEATURES = getPlan("pro").features;

function isEmploymentContract(c: { type: string; title: string }): boolean {
  return /employment/i.test(c.type) || /employment/i.test(c.title);
}

export function BillingPage() {
  const partner = usePartner();
  const inOnboarding = useIsOnboarding();
  // Best-effort read of the subscription columns (migration 196). If 196 isn't applied yet the
  // query errors on the missing columns — we swallow it and fall back to the "start trial" state,
  // so this never breaks the page (and stays out of the critical auth select).
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await createClient()
          .from("partners")
          .select("subscription_status, plan, trial_ends_at, current_period_end")
          .eq("id", partner.id)
          .maybeSingle();
        if (!cancelled && !error && data) setSub(data as SubInfo);
      } catch {
        /* 196 not applied — fall back below */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const status = sub?.subscription_status ?? null;
  const isActive = status === "active";
  const isTrialing = status === "trialing" || (!status && daysLeft(sub?.trial_ends_at ?? null) > 0);
  const trialDays = daysLeft(sub?.trial_ends_at ?? null);
  const currentPlan = getPlan(sub?.plan ?? partner.plan);
  const selectedPlan = (sub?.plan ?? partner.plan) as PlanId;

  const statusBadge = isActive
    ? `${currentPlan.name.toUpperCase()} · ACTIVE`
    : isTrialing
      ? `FREE TRIAL · ${trialDays} DAY${trialDays === 1 ? "" : "S"} LEFT`
      : status
        ? `PLAN · ${status.toUpperCase()}`
        : partner.billingReady
          ? "CARD SAVED · AWAITING ACTIVATION"
          : "ADD PAYMENT METHOD";

  const subline = isActive
    ? sub?.current_period_end
      ? `Renews ${fmtDate(sub.current_period_end)}.`
      : "Subscription active."
    : isTrialing
      ? sub?.trial_ends_at
        ? `Trial ends ${fmtDate(sub.trial_ends_at)}.`
        : "Trial in progress."
      : partner.billingReady
        ? "Your card is saved. Billing starts when your account is approved."
        : "Secure your plan with a card — no charge until Fixfy approves you.";

  if (inOnboarding) {
    return <OnboardingPaymentStep />;
  }

  return (
    <>
      <SettingsHeader title="Billing & plan" />
      <PlanSummaryCard planId={selectedPlan} />
      <div style={{ height: 14 }} />
      <PlanPickerGrid
        selected={selectedPlan}
        onSelect={(id) => void startCheckout(id)}
      />
      <div style={{ height: 14 }} />
      <Card style={{ marginBottom: 14, padding: 0, background: T.navy, color: T.white, borderColor: T.navy }}>
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <Badge tone="coral" size="sm">{statusBadge}</Badge>
            <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, letterSpacing: -0.4 }}>
              {currentPlan.name} <span style={{ color: T.coral }}>· {currentPlan.priceLabel}</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{subline}</div>
          </div>
          <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {isActive ? (
              <Button variant="ghost_dark" size="sm" full onClick={openBillingPortal}>Manage subscription</Button>
            ) : (
              <>
                <Button variant="primary" size="md" icon="arrow-right" full onClick={() => void startCheckout(selectedPlan)}>
                  {partner.billingReady ? "Activate plan" : "Choose plan & pay"}
                </Button>
                <Button variant="ghost_dark" size="sm" full onClick={openBillingPortal}>Manage billing</Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <PageCard title="Payment & invoices" subtitle="Cards, receipts and plan changes are managed securely by Stripe.">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="credit-card" size={18} color={T.navy} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 500 }}>Open the billing portal</div>
            <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>Update your card, download invoices, or change your plan.</div>
          </div>
          <Button variant="secondary" icon="external-link" onClick={openBillingPortal} disabled={!loaded}>Manage</Button>
        </div>
      </PageCard>
    </>
  );
}

// ---------- SELF-BILL ----------
interface PayoutStatus {
  connected: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  method?: "manual" | "stripe" | null;
  accountHolder?: string;
}

export function PaymentHowItWorksCard() {
  const next = getYourNextPayment();
  const schedule = upcomingPayments(new Date(), 4);
  const exampleDate = exampleJobDate(next);
  const exampleAmount = 200;
  const nextAfter = schedule[1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Simple rule */}
      <PageCard title="How you get paid">
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            background: T.navy,
            color: T.white,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: T.coral, marginBottom: 6 }}>SIMPLE RULE</div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>We pay every 2 weeks, always on Friday.</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 8, lineHeight: 1.55 }}>
            Each payment covers 2 full weeks: Monday → Sunday + Monday → Sunday.
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.navy, marginBottom: 8 }}>A job is included when:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {["The job is completed", "The job is approved", "The job start date is inside that period"].map((line) => (
            <div key={line} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: T.ink }}>
              <span style={{ width: 22, height: 22, borderRadius: 9999, background: T.green50, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="check" size={12} />
              </span>
              {line}
            </div>
          ))}
        </div>
      </PageCard>

      {/* Your next payment — hero */}
      <Card style={{ padding: 0, overflow: "hidden", borderColor: T.coral }}>
        <div style={{ padding: "16px 18px", background: T.coralTint, borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: T.coral }}>YOUR NEXT PAYMENT</div>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: T.navy, letterSpacing: -0.5 }}>{fmtPayFriday(next.payFriday)}</div>
          <div style={{ fontSize: 13, color: T.slate, marginTop: 6, lineHeight: 1.5 }}>This payment covers jobs from:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            {[
              { label: "Week 1", range: next.week1 },
              { label: "Week 2", range: next.week2 },
            ].map(({ label, range }) => (
              <div key={label} style={{ padding: "12px 14px", borderRadius: 10, background: T.paper, border: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.coral, letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{fmtDay(range.start)} → {fmtDay(range.end)}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: T.green50, fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
            If your job started between these dates and was approved, it will be paid on <strong style={{ color: T.ink }}>{fmtPayFriday(next.payFriday)}</strong>.
          </div>
        </div>
      </Card>

      {/* Schedule table */}
      <PageCard title="Next payment dates" subtitle="Same system every 2 weeks after this.">
        <div style={{ borderRadius: 10, border: `1px solid ${T.line}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", background: T.paper2, borderBottom: `1px solid ${T.line}` }}>
            <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: T.mute, letterSpacing: 0.4 }}>PAID ON</div>
            <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: T.mute, letterSpacing: 0.4 }}>WORK COVERED</div>
          </div>
          {schedule.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.4fr",
                borderBottom: i < schedule.length - 1 ? `1px solid ${T.line}` : "none",
                background: i === 0 ? T.coralTint : T.white,
              }}
            >
              <div style={{ padding: "11px 14px", fontSize: 13, fontWeight: i === 0 ? 600 : 500, color: T.ink }}>{fmtPayFriday(row.payFriday)}</div>
              <div style={{ padding: "11px 14px", fontSize: 13, fontFamily: T.mono, color: T.slate }}>{fmtRange(row.week1.start, row.week2.end)}</div>
            </div>
          ))}
        </div>
      </PageCard>

      {/* Example */}
      <PageCard title="Easy example">
        <div style={{ padding: "16px 18px", borderRadius: 10, background: T.paper, border: `1px solid ${T.line}` }}>
          <p style={{ fontSize: 14, color: T.ink, lineHeight: 1.65, margin: "0 0 14px" }}>
            You finish a <span className="fx-mono" style={{ fontWeight: 700, color: T.coral }}>{formatGBPdec(exampleAmount)}</span> job on{" "}
            <strong>{fmtDay(exampleDate)}</strong>.
          </p>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.navy, marginBottom: 8 }}>The job:</div>
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13.5, color: T.slate, lineHeight: 1.7 }}>
            <li>is completed</li>
            <li>gets approved</li>
            <li>has a start date between {fmtRange(next.week1.start, next.week2.end)}</li>
          </ul>
          <div style={{ padding: "12px 14px", borderRadius: 8, background: T.green50, border: `1px solid rgba(14,138,95,0.2)` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.green, marginBottom: 4 }}>RESULT</div>
            <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.55 }}>
              You get paid on <strong>{fmtPayFriday(next.payFriday)}</strong>.
            </div>
          </div>
          {nextAfter && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: T.mute, lineHeight: 1.5 }}>
              If the job starts after <strong style={{ color: T.slate }}>{fmtDay(next.week2.end)}</strong>, it moves to the next payment on{" "}
              <strong style={{ color: T.ink }}>{fmtPayFriday(nextAfter.payFriday)}</strong>.
            </div>
          )}
        </div>
      </PageCard>

      {/* Important */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          borderRadius: 10,
          background: T.paper,
          border: `1px solid ${T.line}`,
        }}
      >
        <Icon name="info" size={18} color={T.navy} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.navy }}>Important</div>
          <div style={{ fontSize: 13, color: T.slate, marginTop: 4, lineHeight: 1.55 }}>
            We invoice the customer for you. You do not need to chase payments.
          </div>
        </div>
      </div>
    </div>
  );
}

export interface PayoutsCardHandle {
  ensureReady: () => Promise<boolean>;
}

function PayoutsCardInner({ handleRef }: { handleRef: RefObject<PayoutsCardHandle | null> }) {
  const toast = useToast();
  const inOnboarding = useIsOnboarding();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"connect" | "manual">("manual");
  const [accountHolder, setAccountHolder] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [manualSaved, setManualSaved] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/payouts/status");
      const json = await res.json();
      if (res.ok) {
        const s = json as PayoutStatus;
        setStatus(s);
        if (s.method === "manual" && s.payoutsEnabled) {
          setManualSaved(true);
          setMode("manual");
          if (s.accountHolder) setAccountHolder(s.accountHolder);
        }
      }
    } catch {
      /* leave null */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshStatus();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/payouts/connect", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't start payout setup");
      window.location.href = json.url;
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Payout setup failed", icon: "alert-triangle", tone: "coral" });
      setBusy(false);
    }
  };

  const saveManual = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!accountHolder.trim()) {
      toast({ text: "Enter the account holder name.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    if (sortCode.replace(/\D/g, "").length !== 6) {
      toast({ text: "Sort code must be 6 digits.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    if (accountNumber.replace(/\D/g, "").length !== 8) {
      toast({ text: "Account number must be 8 digits.", icon: "alert-triangle", tone: "coral" });
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payouts/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountHolder: accountHolder.trim(), sortCode, accountNumber }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save bank details");
      setManualSaved(true);
      await refreshStatus();
      if (!opts?.silent) toast({ text: "Bank details saved securely with Stripe", icon: "check" });
      return true;
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save bank details", icon: "alert-triangle", tone: "coral" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ensureReady = useCallback(async (): Promise<boolean> => {
    if (status?.payoutsEnabled || manualSaved) return true;
    if (mode === "manual") return saveManual({ silent: inOnboarding });
    toast({ text: "Connect your bank with Stripe or enter your account details to get paid.", icon: "alert-triangle", tone: "coral" });
    return false;
  }, [status?.payoutsEnabled, manualSaved, mode, inOnboarding, accountHolder, sortCode, accountNumber, toast]);

  useImperativeHandle(handleRef, () => ({ ensureReady }), [ensureReady]);

  const enabled = status?.payoutsEnabled || manualSaved;
  const started = status?.connected && !status.payoutsEnabled && !manualSaved;

  return (
    <PageCard
      title="Payouts"
      subtitle="Where you receive payment for jobs completed through the platform. Bank details are held securely by Stripe."
      action={enabled ? <Badge tone="success" icon="check">Payouts active</Badge> : started ? <Badge tone="warning">Setup incomplete</Badge> : undefined}
    >
      {loading ? (
        <div style={{ color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Checking payout status…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "inline-flex", gap: 6, background: T.paper2, padding: 3, borderRadius: 10, alignSelf: "flex-start" }}>
            {([["connect", "Connect with Stripe"], ["manual", "Enter manually"]] as const).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 500,
                  background: mode === id ? T.white : "transparent",
                  color: mode === id ? T.navy : T.slate,
                  boxShadow: mode === id ? "0 1px 2px rgba(2,0,64,0.12)" : "none",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>

          {mode === "connect" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 10, border: `1px solid ${T.line}`, background: T.paper }}>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                <StripeMark width={44} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>
                  {enabled ? "Bank connected — paid every 2 weeks on Friday" : started ? "Finish connecting your bank on Stripe" : "Connect your bank to receive payouts"}
                </div>
                <div style={{ fontSize: 11.5, color: T.mute, marginTop: 3 }}>Secured by Stripe Connect · trusted by millions of businesses</div>
              </div>
              <Button variant={enabled ? "secondary" : "primary"} icon={enabled ? "pencil" : "arrow-right"} onClick={connect} disabled={busy}>
                {busy ? "Opening…" : enabled ? "Manage" : started ? "Finish setup" : "Connect your bank"}
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 10, border: `1px solid ${T.line}`, background: T.white }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <StripeMark width={40} />
                <span style={{ fontSize: 11.5, color: T.mute }}>Details encrypted and stored with Stripe</span>
              </div>
              <Field label="Account holder name">
                <Input value={accountHolder} onChange={setAccountHolder} placeholder="Full name on the account" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Sort code">
                  <Input value={sortCode} onChange={setSortCode} placeholder="00-00-00" />
                </Field>
                <Field label="Account number">
                  <Input value={accountNumber} onChange={setAccountNumber} placeholder="12345678" />
                </Field>
              </div>
              {inOnboarding ? (
                <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.45 }}>
                  Your bank details save when you click <strong style={{ color: T.slate }}>Continue</strong>.
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="primary" icon="check" onClick={() => void saveManual()} disabled={busy || enabled}>
                    {busy ? "Saving…" : enabled ? "Saved" : "Save bank details"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageCard>
  );
}

/** Embedded in onboarding Your Details — parent owns Continue validation via ref. */
export function PayoutsCardEmbedded({ handleRef }: { handleRef: RefObject<PayoutsCardHandle | null> }) {
  return <PayoutsCardInner handleRef={handleRef} />;
}

export function PayoutsCard() {
  const handleRef = useRef<PayoutsCardHandle | null>(null);
  useRegisterOnboardingSave(async () => handleRef.current?.ensureReady() ?? false);
  return <PayoutsCardInner handleRef={handleRef} />;
}

export function SelfBillPage() {
  const partner = usePartner();
  const inOnboarding = useIsOnboarding();
  const [bills, setBills] = useState<SelfBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inOnboarding) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchSelfBills(createClient(), partner.id);
        if (!cancelled) setBills(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load self-bills");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id, inOnboarding]);

  const past = bills.filter((b) => !b.isAccumulating);

  return (
    <>
      {!inOnboarding && <SettingsHeader title="Self-bill" subtitle="UK self-billing: Fixfy issues invoices to you for completed jobs. HMRC-compliant." />}

      <PageCard title="Agreement" subtitle="Valid 12 months. Re-sign required at 11 months." action={<Badge tone="success" icon="shield-check">Signed</Badge>}>
        <div style={{ display: "grid", gridTemplateColumns: inOnboarding ? "1fr" : "1fr auto", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.6 }}>
            You authorise GET FIXFY LTD to issue self-bill invoices on your behalf for jobs completed via the platform. You agree not to issue separate invoices for the same work.
          </div>
          {!inOnboarding && <Button variant="secondary" icon="download">View agreement</Button>}
        </div>
      </PageCard>

      <PaymentHowItWorksCard />

      {!inOnboarding && <PayoutsCard />}

      {!inOnboarding && (
      <PageCard title="Past self-bills">
        {loading ? (
          <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="loader" size={14} color={T.mute} /> Loading self-bills…
          </div>
        ) : error ? (
          <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
        ) : past.length === 0 ? (
          <div style={{ padding: 8, color: T.mute, fontSize: 13 }}>No self-bills issued yet. They appear here once your completed jobs are billed.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Issued", "Period", "Jobs", "Value", "Net", "Status", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: 0.4, color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.line}`, textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {past.map((b) => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: 12, fontSize: 13, fontFamily: T.mono, color: T.slate }}>{b.issued || "—"}</td>
                    <td style={{ padding: 12, fontSize: 13, color: T.ink }}>{b.period}</td>
                    <td style={{ padding: 12, fontSize: 13, fontFamily: T.mono, color: T.slate }}>{b.jobs}</td>
                    <td style={{ padding: 12, fontSize: 13, fontFamily: T.mono, color: T.ink }}>{formatGBPdec(b.value)}</td>
                    <td style={{ padding: 12, fontSize: 13, fontFamily: T.mono, color: T.ink, fontWeight: 500 }}>{formatGBPdec(b.net)}</td>
                    <td style={{ padding: 12 }}>
                      <Badge tone={b.tone} size="sm">
                        {b.statusLabel}
                      </Badge>
                    </td>
                    <td style={{ padding: 12 }}>
                      {b.hasPdf && <Button variant="ghost" size="xs" icon="download">PDF</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
      )}
    </>
  );
}

// ---------- DOCS ----------
type RequiredDoc = RequiredDocDef;

export function DocsPage({ onChanged }: { onChanged?: () => void } = {}) {
  const partner = usePartner();
  const inOnboarding = useIsOnboarding();
  const toast = useToast();
  const [docs, setDocs] = useState<PartnerDoc[]>([]);
  const [required, setRequired] = useState<RequiredDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Required docs are dynamic — they depend on the partner's legal type + trades
      // (set in the earlier onboarding steps), resolved server-side via the OS doc rules.
      const [rows, reqJson] = await Promise.all([
        fetchPartnerDocuments(createClient(), partner.id),
        fetch("/api/partner/required-docs")
          .then((r) => r.json())
          .catch(() => ({ required: [] as RequiredDoc[] })),
      ]);
      setDocs(rows);
      if (Array.isArray(reqJson?.required)) setRequired(reqJson.required as RequiredDoc[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (docType: string, name: string, file: File) => {
    setBusyType(docType);
    try {
      const form = new FormData();
      form.set("docType", docType);
      form.set("name", name);
      form.set("file", file);
      const res = await fetch("/api/partner/documents", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast({ text: `${name} uploaded — we'll review it shortly`, icon: "check" });
      await load();
      onChanged?.();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Upload failed", icon: "alert-triangle", tone: "coral" });
    } finally {
      setBusyType(null);
    }
  };

  const docRows = docs.map((d) => ({
    id: d.id,
    name: d.name,
    doc_type: d.docType,
    status: d.status,
    created_at: new Date(0).toISOString(),
  }));
  const missing = missingFromChecklist(docRows, required);
  const extraDocs = docs.filter((d) => !required.some((r) => pickRequiredDocMatch(docRows, r)));

  return (
    <>
      {!inOnboarding && <SettingsHeader title="Documents & certifications" subtitle="What we need on file before you can pick up work." />}
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading documents…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : (
        <>
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: missing.length === 0 ? T.green50 : T.coralTint,
              color: missing.length === 0 ? T.green : T.coral,
            }}
          >
            <Icon name={missing.length === 0 ? "shield-check" : "alert-triangle"} size={15} />
            {missing.length === 0
              ? "All required documents are on file. You're cleared to work."
              : `${missing.length} required document${missing.length === 1 ? "" : "s"} still needed before you can use the platform.`}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {required.map((req) => {
              const doc = pickRequiredDocMatch(docRows, req);
              const mapped = doc ? docs.find((d) => d.id === doc.id) : undefined;
              return (
                <RequiredDocCard
                  key={req.id}
                  req={req}
                  doc={mapped}
                  busy={busyType === req.docType}
                  onUpload={(file) => upload(req.docType, req.name, file)}
                />
              );
            })}
            {extraDocs.map((d) => (
              <DocCard key={d.id} doc={d} />
            ))}
            <DocUploadCard busy={busyType === "other"} onUpload={(name, file) => upload("other", name || "Document", file)} />
          </div>
        </>
      )}
    </>
  );
}

function RequiredDocCard({
  req,
  doc,
  busy,
  onUpload,
}: {
  req: { docType: string; name: string; description: string };
  doc?: PartnerDoc;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const statusMap = {
    verified: { tone: "success", label: "Verified", icon: "shield-check" },
    pending: { tone: "warning", label: "In review", icon: "hourglass" },
    expired: { tone: "danger", label: "Expired", icon: "alert-triangle" },
    rejected: { tone: "danger", label: "Rejected", icon: "x-circle" },
    required: { tone: "neutral", label: "Required", icon: "upload" },
  } as const;
  const s = doc ? statusMap[doc.status] : null;
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, border: doc ? undefined : `1px solid ${T.coral}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={doc ? statusMap[doc.status].icon : "upload"} size={18} color={T.navy} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{req.name}</div>
          <div style={{ fontSize: 11.5, color: T.mute }}>{req.description}</div>
        </div>
        <Badge tone={s ? s.tone : "danger"} icon={s ? s.icon : "alert-triangle"} size="sm">
          {s ? s.label : "Required"}
        </Badge>
      </div>
      <label style={{ cursor: busy ? "default" : "pointer" }}>
        <input
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 500,
            color: doc ? T.slate : T.coral,
          }}
        >
          <Icon name={busy ? "loader" : doc ? "refresh-cw" : "upload"} size={13} color={doc ? T.slate : T.coral} />
          {busy ? "Uploading…" : doc ? "Replace" : "Upload"}
        </span>
      </label>
    </Card>
  );
}

function DocCard({ doc }: { doc: PartnerDoc }) {
  const statusMap = {
    verified: { tone: "success", label: "Verified", icon: "shield-check" },
    pending: { tone: "warning", label: "In review", icon: "hourglass" },
    expired: { tone: "danger", label: "Expired", icon: "alert-triangle" },
    rejected: { tone: "danger", label: "Rejected", icon: "x-circle" },
    required: { tone: "neutral", label: "Required", icon: "upload" },
  } as const;
  const s = statusMap[doc.status];
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={doc.icon} size={18} color={T.navy} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{doc.name}</div>
          <div style={{ fontSize: 11.5, color: T.mute }}>{doc.kind}</div>
        </div>
        <Badge tone={s.tone} icon={s.icon} size="sm">
          {s.label}
        </Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: T.paper, borderRadius: 8, fontSize: 11.5, color: T.slate }}>
        <Icon name="file-text" size={13} color={T.mute} />
        <span style={{ flex: 1, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.fileName}</span>
        <span style={{ color: T.mute }}>Expires {doc.expires}</span>
      </div>
      {doc.warning && (
        <div style={{ fontSize: 11.5, color: T.amber, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="bell" size={11} /> Reminder: {doc.warning}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {doc.fileUrl ? (
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <Button variant="ghost" size="sm" icon="eye">View</Button>
          </a>
        ) : (
          <Button variant="ghost" size="sm" icon="eye">View</Button>
        )}
        <Button variant="ghost" size="sm" icon="upload">Replace</Button>
      </div>
    </Card>
  );
}

function DocUploadCard({ busy, onUpload }: { busy: boolean; onUpload: (name: string, file: File) => void }) {
  const [name, setName] = useState("");
  return (
    <Card style={{ padding: 16, border: `1.5px dashed ${T.line}`, background: T.paper, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: T.white, border: `1px solid ${T.line}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="upload" size={18} color={T.mute} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>Add another document</div>
          <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>e.g. a trade certificate · PDF/JPG/PNG · max 10 MB</div>
        </div>
      </div>
      <Input value={name} onChange={setName} placeholder="Document name (e.g. NICEIC certificate)" />
      <label style={{ cursor: busy ? "default" : "pointer", alignSelf: "flex-start" }}>
        <input
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(name, f);
            e.target.value = "";
            setName("");
          }}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: T.coral }}>
          <Icon name={busy ? "loader" : "plus"} size={13} color={T.coral} /> {busy ? "Uploading…" : "Choose file & upload"}
        </span>
      </label>
    </Card>
  );
}

// ---------- POLICIES ----------
const CONTRACT_ICON: Record<string, string> = {
  terms_of_use: "gavel",
  self_bill_agreement: "receipt",
  contractor_service_agreement: "file-signature",
};

export function PoliciesPage() {
  const partner = usePartner();
  const toast = useToast();
  const inOnboarding = useIsOnboarding();
  const [contracts, setContracts] = useState<PartnerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<PartnerContract | null>(null);
  const [bulkSigning, setBulkSigning] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(`${partner.firstName} ${partner.lastName}`.trim());
  const [signBusy, setSignBusy] = useState(false);

  const visibleContracts = contracts.filter((c) => !isEmploymentContract(c));
  const unsignedContracts = visibleContracts.filter((c) => !c.signed);
  const allSigned = visibleContracts.length > 0 && unsignedContracts.length === 0;

  const submitBulkSignature = async () => {
    if (!sig || !signerName.trim() || unsignedContracts.length === 0) return;
    setSignBusy(true);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't sign");
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const signedByVersion = new Map(
        (json.contracts as Array<{ contractVersionId: string; signaturePdfUrl: string | null }> | undefined)?.map((r) => [
          r.contractVersionId,
          r.signaturePdfUrl,
        ]) ?? [],
      );
      setContracts((prev) =>
        prev.map((c) =>
          signedByVersion.has(c.versionId) || unsignedContracts.some((u) => u.versionId === c.versionId)
            ? {
                ...c,
                signed: true,
                signedAt: today,
                signaturePdfUrl: signedByVersion.get(c.versionId) ?? c.signaturePdfUrl,
              }
            : c,
        ),
      );
      toast({ text: "All agreements signed", icon: "check" });
      setBulkSigning(false);
      setSig(null);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't sign", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSignBusy(false);
    }
  };

  useRegisterOnboardingSave(async () => {
    if (loading) return false;
    if (allSigned) return true;
    toast({ text: "Sign all agreements before continuing", icon: "alert-triangle", tone: "coral" });
    return false;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchContracts(createClient(), partner.id);
        if (!cancelled) setContracts(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load policies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  return (
    <>
      {!inOnboarding && <SettingsHeader title="Policies & contracts" subtitle="The agreements that govern working with Fixfy. Read them any time." />}
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading policies…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : visibleContracts.length === 0 ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13 }}>No active contracts published.</div>
      ) : (
        <>
          {unsignedContracts.length > 0 && (
            <Card style={{ padding: 16, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>
                  {unsignedContracts.length} agreement{unsignedContracts.length === 1 ? "" : "s"} to sign
                </div>
                <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>
                  One signature covers all agreements below. Read each one first if you need to.
                </div>
              </div>
              <Button variant="primary" icon="pen-line" onClick={() => { setSig(null); setBulkSigning(true); }}>
                Sign all agreements
              </Button>
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {visibleContracts.map((c) => (
              <Card key={c.versionId} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={CONTRACT_ICON[c.type] ?? "gavel"} size={18} color={T.navy} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{c.title}</div>
                  </div>
                  {c.signed ? (
                    <Badge tone="success" size="sm" icon="check">Signed</Badge>
                  ) : (
                    <Badge tone="warning" size="sm">Pending</Badge>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="ghost" size="sm" iconRight="arrow-up-right" onClick={() => setReading(c)} style={{ flex: 1, minWidth: 100 }}>
                    Read
                  </Button>
                  {c.signed && c.signaturePdfUrl ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="download"
                      onClick={() => window.open(c.signaturePdfUrl!, "_blank", "noopener,noreferrer")}
                      style={{ flex: 1, minWidth: 100 }}
                    >
                      PDF
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {bulkSigning && (
        <Modal title="Sign all agreements" onClose={() => setBulkSigning(false)} width={520}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
              By signing once below you agree to all of the following. Your name, the time, your IP and device are recorded
              for a legally-valid UK e-signature on each agreement.
            </div>
            <Card style={{ padding: 12, background: T.paper2 }}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
                {unsignedContracts.map((c) => (
                  <li key={c.versionId}>{c.title}{c.version ? ` (v${c.version})` : ""}</li>
                ))}
              </ul>
            </Card>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>Full name</div>
              <Input value={signerName} onChange={setSignerName} placeholder="Your full legal name" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>Signature</div>
              <SignaturePad onChange={setSig} />
            </div>
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setBulkSigning(false)} disabled={signBusy}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={submitBulkSignature} disabled={signBusy || !sig || !signerName.trim()}>
              {signBusy ? "Signing…" : "Agree & sign all"}
            </Button>
          </div>
        </Modal>
      )}

      {reading && (
        <Modal title={reading.title} onClose={() => setReading(null)} width={680}>
          <div style={{ padding: 20, maxHeight: "60vh", overflow: "auto", fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
            {reading.bodyHtml ? (
              <div dangerouslySetInnerHTML={{ __html: hydrateContractHtml(reading.bodyHtml) }} />
            ) : (
              <div style={{ color: T.mute }}>No contract text available.</div>
            )}
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setReading(null)}>Close</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
