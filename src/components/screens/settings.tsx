"use client";

// Settings — 10 sub-pages with a left sub-nav. Ported from settings.jsx.
// Several pages (Trades, Service area, Availability, Rate card, Documents) are reused
// by the onboarding flow, so they're exported.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { Avatar, Badge, Button, Card, Icon, Input, Modal, Toggle } from "@/components/ui/primitives";
import { MapBackground } from "@/components/ui/map-background";
import { SignaturePad } from "@/components/ui/signature-pad";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { createClient } from "@/lib/supabase/client";
import { formatGBPdec } from "@/lib/format";
import { fetchSelfBills, type SelfBill } from "@/lib/queries/self-bills";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import { fetchContracts, type PartnerContract } from "@/lib/queries/contracts";
import { fetchRateCard, saveRateCard, type ServicePrice, type RateCardPatch } from "@/lib/queries/rate-card";
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
import type { Trade } from "@/types";

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
  const [page, setPage] = useState(initial);
  useEffect(() => {
    setPage(initial);
  }, [initial]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1, overflow: "hidden" }}>
      {/* Sub-nav */}
      <div style={{ borderRight: `1px solid ${T.line}`, padding: 16, overflow: "auto", background: T.white }}>
        <div style={{ fontSize: 11, letterSpacing: 0.5, color: T.mute, fontWeight: 500, textTransform: "uppercase", padding: "0 10px 8px" }}>
          Settings
        </div>
        {SETTINGS_PAGES.map((p) => {
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
        {page === "billing" && <BillingPage />}
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
      <PageCard title="About you">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <Avatar initials={partner.initials} size={72} bg={T.navy} />
          <div>
            <Button variant="secondary" size="sm" icon="camera">Upload photo</Button>
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
const ALL_TRADES: Trade[] = [
  "Plumbing",
  "General Maintenance",
  "Light Carpentry",
  "Electrical",
  "Painting & Decorating",
  "Tiling",
  "Plastering",
  "Flooring",
];

export function TradesPage() {
  const partner = usePartner();
  const toast = useToast();
  const router = useRouter();
  const initialEnabled = partner.trades;
  const initialPrimary = partner.primaryTrade;
  const [enabled, setEnabled] = useState<Trade[]>(initialEnabled);
  const [primary, setPrimary] = useState<Trade>(initialPrimary);
  const [saving, setSaving] = useState(false);

  const dirty =
    primary !== initialPrimary ||
    enabled.length !== initialEnabled.length ||
    enabled.some((t) => !initialEnabled.includes(t));

  const toggle = (t: Trade) => {
    setEnabled((prev) => {
      if (prev.includes(t)) {
        const next = prev.filter((x) => x !== t);
        if (t === primary) setPrimary(next[0] ?? t); // reassign primary if it was disabled
        return next;
      }
      return [...prev, t];
    });
  };

  const makePrimary = (t: Trade) => {
    setEnabled((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setPrimary(t);
  };

  const save = async () => {
    if (enabled.length === 0) {
      toast({ text: "Enable at least one trade.", icon: "alert-triangle", tone: "coral" });
      return;
    }
    setSaving(true);
    try {
      const trades = enabled.includes(primary) ? enabled : [primary, ...enabled];
      const { data, error } = await createClient()
        .from("partners")
        .update({ trades, trade: primary })
        .eq("id", partner.id)
        .select("id");
      if (error) throw error;
      // RLS-scoped UPDATE that matches 0 rows returns no error but no data — surface it.
      if (!data || data.length === 0) {
        throw new Error("Save was blocked. Make sure migration 198 is applied (partner self-update RLS).");
      }
      toast({ text: "Trades saved", icon: "check" });
      router.refresh(); // re-fetch the partner context so the saved trades persist across navigation
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save trades", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsHeader title="Trades & skills" subtitle="What you do, what you don't. We only send leads matching enabled trades." />
      <PageCard title="Trades">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {ALL_TRADES.map((name) => {
            const on = enabled.includes(name);
            const isPrimary = on && name === primary;
            return (
              <div
                key={name}
                style={{ padding: 14, borderRadius: 10, border: `1px solid ${isPrimary ? T.coral : T.line}`, background: on ? T.white : T.paper, opacity: on ? 1 : 0.85 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: T.ink, flex: 1 }}>{name}</span>
                  {isPrimary && <Badge tone="coral" size="sm">Primary</Badge>}
                  <Toggle on={on} onChange={() => toggle(name)} />
                </div>
                {on && !isPrimary && (
                  <button
                    onClick={() => makePrimary(name)}
                    style={{
                      marginTop: 10,
                      padding: 0,
                      background: "transparent",
                      border: "none",
                      color: T.coral,
                      fontFamily: T.sans,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Make primary
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </PageCard>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          variant="ghost"
          onClick={() => {
            setEnabled(initialEnabled);
            setPrimary(initialPrimary);
          }}
          disabled={!dirty || saving}
        >
          Cancel
        </Button>
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save trades"}
        </Button>
      </div>
    </>
  );
}

// ---------- RATE CARD ----------
// Real per-service pricing: partner_service_prices joined to service_catalog. Each service is
// either the catalog standard cost (use_standard) or the partner's own override.
export function RatesPage() {
  const partner = usePartner();
  const toast = useToast();
  const [rows, setRows] = useState<ServicePrice[]>([]);
  const [initial, setInitial] = useState<ServicePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRateCard(createClient(), partner.id);
        if (!cancelled) {
          setRows(data);
          setInitial(data);
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
  }, [partner.id]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const update = (id: string, patch: Partial<ServicePrice>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(/[^0-9.]/g, "")) || 0);

  const save = async () => {
    setSaving(true);
    try {
      const patches: RateCardPatch[] = rows.map((r) => ({
        id: r.id,
        use_standard: r.useStandard,
        fixed_partner_cost: r.useStandard ? r.fixedPartnerCost : r.mode === "fixed" ? r.fixedPartnerCost : null,
        hourly_partner_rate: r.useStandard ? r.hourlyPartnerRate : r.mode === "hourly" ? r.hourlyPartnerRate : null,
        default_hours: r.mode === "hourly" ? r.defaultHours : null,
      }));
      await saveRateCard(createClient(), patches);
      setInitial(rows);
      toast({ text: "Rate card saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save rate card", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsHeader title="Rate card" subtitle="Your cost per service. Use the Fixfy standard or set your own — customers see totals only." />
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading rate card…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : rows.length === 0 ? (
        <PageCard title="Services">
          <div style={{ fontSize: 13, color: T.mute }}>
            No services set up yet. Fixfy configures which services you&apos;re offered — they&apos;ll appear here to price.
          </div>
        </PageCard>
      ) : (
        <>
          <PageCard title="Your services" subtitle="Toggle off &quot;standard&quot; to charge your own rate.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r) => {
                const standard = r.mode === "hourly" ? `${formatGBPdec(r.standardHourly)}/hr · ${r.standardHours}h` : formatGBPdec(r.standardFixed);
                return (
                  <div key={r.id} style={{ padding: 12, border: `1px solid ${T.line}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{r.name}</div>
                        <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
                          {r.mode === "hourly" ? "Hourly" : "Fixed"} · standard <span className="fx-mono">{standard}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: T.slate }}>Use standard</span>
                      <Toggle on={r.useStandard} onChange={(v) => update(r.id, { useStandard: v })} />
                    </div>
                    {!r.useStandard && (
                      <div style={{ display: "flex", gap: 8, paddingLeft: 2 }}>
                        {r.mode === "hourly" ? (
                          <>
                            <Input
                              value={r.hourlyPartnerRate != null ? String(r.hourlyPartnerRate) : ""}
                              onChange={(v) => update(r.id, { hourlyPartnerRate: num(v) })}
                              prefix="£"
                              suffix="/hr"
                              placeholder={String(r.standardHourly)}
                              style={{ width: 160 }}
                            />
                            <Input
                              value={r.defaultHours != null ? String(r.defaultHours) : ""}
                              onChange={(v) => update(r.id, { defaultHours: num(v) })}
                              suffix="hrs"
                              placeholder={String(r.standardHours)}
                              style={{ width: 120 }}
                            />
                          </>
                        ) : (
                          <Input
                            value={r.fixedPartnerCost != null ? String(r.fixedPartnerCost) : ""}
                            onChange={(v) => update(r.id, { fixedPartnerCost: num(v) })}
                            prefix="£"
                            placeholder={String(r.standardFixed)}
                            style={{ width: 180 }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PageCard>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setRows(initial)} disabled={!dirty || saving}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save rate card"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

// ---------- AVAILABILITY ----------
export function AvailabilityPage() {
  const partner = usePartner();
  const toast = useToast();
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

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={() => setAv(initial)} disabled={!dirty || saving}>Cancel</Button>
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save availability"}
        </Button>
      </div>
    </>
  );
}

// ---------- SERVICE AREA ----------
export function ServiceAreaPage() {
  const partner = usePartner();
  const toast = useToast();
  const initial = {
    postcode: partner.postcode,
    radius: partner.radiusMiles,
    excluded: (partner.excludedPostcodes ?? []).join(", "),
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    try {
      const excluded = form.excluded
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const { error } = await createClient()
        .from("partners")
        .update({ location: form.postcode || null, service_radius_miles: form.radius, excluded_postcodes: excluded })
        .eq("id", partner.id);
      if (error) throw error;
      toast({ text: "Service area saved", icon: "check" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save service area", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsHeader title="Service area" subtitle="Where you work. Bigger area = more matches, more drive time." />
      <PageCard title="Coverage">
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row label="Base postcode" columns="1fr">
              <Input value={form.postcode} onChange={(v) => setForm((f) => ({ ...f, postcode: v }))} icon="map-pin" placeholder="e.g. SW11 4PG" />
            </Row>
            <Row label="Radius" columns="1fr">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={form.radius}
                  onChange={(e) => setForm((f) => ({ ...f, radius: Number(e.target.value) }))}
                  style={{ flex: 1, accentColor: T.coral }}
                />
                <span className="fx-mono" style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>
                  {form.radius} mi
                </span>
              </div>
            </Row>
            <Row label="Excluded postcodes" hint="Comma-separated" columns="1fr">
              <Input value={form.excluded} onChange={(v) => setForm((f) => ({ ...f, excluded: v }))} placeholder="e.g. SE1, E14" />
            </Row>
          </div>
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", minHeight: 320, background: "#E8EAF0" }}>
            <MapBackground />
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
              <div style={{ width: 16, height: 16, borderRadius: 9999, background: T.navy, border: `3px solid ${T.white}`, boxShadow: "0 4px 8px rgba(2,0,64,0.3)" }} />
            </div>
            {[
              { r: 240, op: 0.04 },
              { r: 200, op: 0.06 },
              { r: 160, op: 0.08 },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: c.r,
                  height: c.r,
                  borderRadius: 9999,
                  background: `rgba(237,75,0,${c.op})`,
                  border: `1.5px ${i === 0 ? "dashed" : "solid"} rgba(237,75,0,0.4)`,
                }}
              />
            ))}
            {form.postcode && (
              <div style={{ position: "absolute", bottom: 12, left: 12, padding: "8px 12px", background: T.white, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11.5, color: T.slate, lineHeight: 1.5 }}>
                <div>
                  <b>{form.postcode}</b> · {form.radius} mi radius
                </div>
              </div>
            )}
          </div>
        </div>
      </PageCard>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={() => setForm(initial)} disabled={!dirty || saving}>Cancel</Button>
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save service area"}
        </Button>
      </div>
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

const PRO_FEATURES = [
  "0% commission on every job",
  "Unlimited leads and jobs",
  "Card-to-bank payouts (Net-7)",
  "Self-bill PDFs auto-generated",
  "Customer report templates",
  "24/7 emergency dispatch",
];

function BillingPage() {
  const partner = usePartner();
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

  const statusBadge = isActive
    ? "FIXFY PRO · ACTIVE"
    : isTrialing
      ? `FREE TRIAL · ${trialDays} DAY${trialDays === 1 ? "" : "S"} LEFT`
      : status
        ? `PLAN · ${status.toUpperCase()}`
        : "NO ACTIVE PLAN";

  const subline = isActive
    ? sub?.current_period_end
      ? `Renews ${fmtDate(sub.current_period_end)}.`
      : "Subscription active."
    : isTrialing
      ? sub?.trial_ends_at
        ? `Trial ends ${fmtDate(sub.trial_ends_at)}.`
        : "Trial in progress."
      : "Start your Fixfy Pro plan to keep receiving work.";

  return (
    <>
      <SettingsHeader title="Billing & plan" />
      <Card style={{ marginBottom: 14, padding: 0, background: T.navy, color: T.white, borderColor: T.navy }}>
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <Badge tone="coral" size="sm">{statusBadge}</Badge>
            <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, letterSpacing: -0.4 }}>
              Fixfy Pro <span style={{ color: T.coral }}>· £99</span>/month
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{subline}</div>
            <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {PRO_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
                  <Icon name="check" size={13} color={T.coral} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.12)" }} />
          <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {isTrialing && (
              <>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.4 }}>TRIAL ENDS IN</div>
                <div style={{ fontFamily: T.mono, fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: -1 }}>
                  {trialDays}
                  <span style={{ fontSize: 16, opacity: 0.6, fontWeight: 400 }}> day{trialDays === 1 ? "" : "s"}</span>
                </div>
              </>
            )}
            {isActive ? (
              <Button variant="ghost_dark" size="sm" full onClick={openBillingPortal}>Manage subscription</Button>
            ) : (
              <>
                <Button variant="primary" size="md" icon="arrow-right" full onClick={startCheckout}>
                  {isTrialing ? "Switch to Pro now" : "Start Fixfy Pro"}
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
}

function PayoutsCard() {
  const toast = useToast();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payouts/status");
        const json = await res.json();
        if (!cancelled && res.ok) setStatus(json as PayoutStatus);
      } catch {
        /* leave null */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const enabled = status?.payoutsEnabled;
  const started = status?.connected && !status.payoutsEnabled;

  return (
    <PageCard
      title="Payouts"
      subtitle="Bank details are held securely by Stripe — Fixfy never sees them."
      action={enabled ? <Badge tone="success" icon="check">Payouts active</Badge> : started ? <Badge tone="warning">Setup incomplete</Badge> : undefined}
    >
      {loading ? (
        <div style={{ color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Checking payout status…
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="banknote" size={18} color={T.navy} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>
              {enabled ? "Connected — paid by bank transfer (Net-7)" : started ? "Finish connecting your bank to get paid" : "Connect your bank to receive payouts"}
            </div>
            <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>Secured by Stripe Connect.</div>
          </div>
          <Button variant={enabled ? "secondary" : "primary"} icon={enabled ? "pencil" : "arrow-right"} onClick={connect} disabled={busy}>
            {busy ? "Opening…" : enabled ? "Manage" : started ? "Finish setup" : "Set up payouts"}
          </Button>
        </div>
      )}
    </PageCard>
  );
}

function SelfBillPage() {
  const partner = usePartner();
  const [bills, setBills] = useState<SelfBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [partner.id]);

  const accumulating = bills.find((b) => b.isAccumulating);
  const past = bills.filter((b) => !b.isAccumulating);

  return (
    <>
      <SettingsHeader title="Self-bill" subtitle="UK self-billing: Fixfy issues invoices to you for completed jobs. HMRC-compliant." />

      <PageCard title="Agreement" subtitle="Valid 12 months. Re-sign required at 11 months." action={<Badge tone="success" icon="shield-check">Signed</Badge>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.6 }}>
            You authorise GET FIXFY LTD to issue self-bill invoices on your behalf for jobs completed via the platform. You agree not to issue separate invoices for the same work.
          </div>
          <Button variant="secondary" icon="download">View agreement</Button>
        </div>
      </PageCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontSize: 14, fontWeight: 500, color: T.navy }}>VAT status</div>
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <RadioOption selected label="Not VAT registered" hint="Threshold £90,000/yr" />
              <RadioOption selected={false} label="VAT registered" hint="Self-bills include VAT lines" />
            </div>
            <Input value="" placeholder="VAT number (if registered)" prefix="GB" />
          </div>
        </Card>
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontSize: 14, fontWeight: 500, color: T.navy }}>Payout schedule</div>
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <RadioOption selected label="Weekly · Friday" hint="Default · Net-7" />
              <RadioOption selected={false} label="Fortnightly" />
              <RadioOption selected={false} label="Monthly" />
            </div>
            <div style={{ marginTop: 14, padding: "10px 12px", background: T.paper, borderRadius: 8, fontSize: 12, color: T.slate }}>
              {accumulating ? (
                <>
                  This week ({accumulating.period}): <b className="fx-mono" style={{ color: T.navy }}>{formatGBPdec(accumulating.net)} net</b> from{" "}
                  {accumulating.jobs} job{accumulating.jobs === 1 ? "" : "s"} so far.
                </>
              ) : (
                <>Completed jobs accumulate into a weekly self-bill, paid Net-7.</>
              )}
            </div>
          </div>
        </Card>
      </div>

      <PayoutsCard />

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
    </>
  );
}

function RadioOption({ selected, label, hint }: { selected: boolean; label: string; hint?: string }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 8, border: `1.5px solid ${selected ? T.coral : T.line}`, background: selected ? T.coralTint : T.white, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 14, height: 14, borderRadius: 9999, border: `2px solid ${selected ? T.coral : T.lineStrong}`, background: T.white, position: "relative" }}>
          {selected && <span style={{ position: "absolute", inset: 2, borderRadius: 9999, background: T.coral }} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</span>
      </div>
      {hint && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 4, marginLeft: 22 }}>{hint}</div>}
    </div>
  );
}

// ---------- DOCS ----------
export function DocsPage() {
  const partner = usePartner();
  const [docs, setDocs] = useState<PartnerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchPartnerDocuments(createClient(), partner.id);
        if (!cancelled) setDocs(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load documents");
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
      <SettingsHeader title="Documents & certifications" subtitle="What we need on file to dispatch jobs to you." />
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading documents…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} />
          ))}
          {docs.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 16, color: T.mute, fontSize: 13 }}>
              No documents on file yet. Upload your insurance, certifications and ID to start receiving jobs.
            </div>
          )}
          <DocUploadCard />
        </div>
      )}
    </>
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

function DocUploadCard() {
  return (
    <Card style={{ padding: 16, border: `1.5px dashed ${T.line}`, background: T.paper, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: T.white, border: `1px solid ${T.line}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="upload" size={18} color={T.mute} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>Add another document</div>
        <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>PDF/JPG/PNG · max 10 MB · signed URLs</div>
      </div>
      <Button variant="primary" size="sm" icon="plus">Upload</Button>
    </Card>
  );
}

// ---------- POLICIES ----------
const CONTRACT_ICON: Record<string, string> = {
  terms_of_use: "gavel",
  self_bill_agreement: "receipt",
};

function PoliciesPage() {
  const partner = usePartner();
  const toast = useToast();
  const [contracts, setContracts] = useState<PartnerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<PartnerContract | null>(null);
  const [signing, setSigning] = useState<PartnerContract | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(`${partner.firstName} ${partner.lastName}`.trim());
  const [signBusy, setSignBusy] = useState(false);

  const submitSignature = async () => {
    if (!signing || !sig || !signerName.trim()) return;
    setSignBusy(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractVersionId: signing.versionId,
          contractType: signing.type,
          signatureDataUrl: sig,
          signerName: signerName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't sign");
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      setContracts((prev) => prev.map((c) => (c.versionId === signing.versionId ? { ...c, signed: true, signedAt: today } : c)));
      toast({ text: "Contract signed", icon: "check" });
      setSigning(null);
      setSig(null);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't sign", icon: "alert-triangle", tone: "coral" });
    } finally {
      setSignBusy(false);
    }
  };

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
      <SettingsHeader title="Policies & contracts" subtitle="The agreements that govern working with Fixfy. Read them any time." />
      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading policies…
        </div>
      ) : error ? (
        <div style={{ padding: 8, color: T.coral, fontSize: 13 }}>{error}</div>
      ) : contracts.length === 0 ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13 }}>No active contracts published.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {contracts.map((c) => (
            <Card key={c.versionId} style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={CONTRACT_ICON[c.type] ?? "gavel"} size={18} color={T.navy} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
                  {c.version && <>v{c.version} · </>}
                  {c.signed ? `Signed${c.signedAt ? ` ${c.signedAt}` : ""}` : "Not signed yet"}
                </div>
              </div>
              {c.signed ? (
                <Badge tone="success" size="sm" icon="check">Signed</Badge>
              ) : (
                <Badge tone="warning" size="sm">Pending</Badge>
              )}
              <Button variant="ghost" size="sm" iconRight="arrow-up-right" onClick={() => setReading(c)}>
                Read
              </Button>
              {!c.signed && (
                <Button variant="primary" size="sm" icon="pen-line" onClick={() => { setSig(null); setSigning(c); }}>
                  Sign
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {signing && (
        <Modal title={`Sign — ${signing.title}`} onClose={() => setSigning(null)} width={520}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
              By signing you agree to the {signing.title}
              {signing.version ? ` (v${signing.version})` : ""}. Your name, the time, your IP and device are recorded for a
              legally-valid UK e-signature.
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>Full name</div>
              <Input value={signerName} onChange={setSignerName} placeholder="Your full legal name" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>Signature</div>
              <SignaturePad onChange={setSig} />
            </div>
            <button
              style={{ alignSelf: "flex-start", padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: 8, alignItems: "flex-start" }}
            >
              <Icon name="info" size={13} color={T.mute} />
              <span style={{ fontSize: 11.5, color: T.mute, textAlign: "left" }}>Read the full text first via the Read button.</span>
            </button>
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setSigning(null)} disabled={signBusy}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={submitSignature} disabled={signBusy || !sig || !signerName.trim()}>
              {signBusy ? "Signing…" : "Agree & sign"}
            </Button>
          </div>
        </Modal>
      )}

      {reading && (
        <Modal title={reading.title} onClose={() => setReading(null)} width={680}>
          <div style={{ padding: 20, maxHeight: "60vh", overflow: "auto", fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
            {reading.bodyHtml ? (
              <div dangerouslySetInnerHTML={{ __html: reading.bodyHtml }} />
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
