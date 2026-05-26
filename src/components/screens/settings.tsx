"use client";

// Settings — 10 sub-pages with a left sub-nav. Ported from settings.jsx.
// Several pages (Trades, Service area, Availability, Rate card, Documents) are reused
// by the onboarding flow, so they're exported.

import { useEffect, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Badge, Button, Card, Icon, Input, Toggle } from "@/components/ui/primitives";
import { MapBackground } from "@/components/ui/map-background";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { createClient } from "@/lib/supabase/client";
import { formatGBPdec } from "@/lib/format";
import { fetchSelfBills, type SelfBill } from "@/lib/queries/self-bills";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
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
// Persists the columns the `partners` table actually has: contact_name (Name),
// phone, company_name (Trading name). Fields without a backing column yet
// (DOB, company number, VAT number, years experience, bio) are shown but not saved.
function ProfilePage() {
  const partner = usePartner();
  const toast = useToast();
  const initial = {
    firstName: partner.firstName,
    lastName: partner.lastName,
    phone: partner.phone,
    tradingName: partner.tradingName,
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const contactName = `${form.firstName} ${form.lastName}`.trim();
      const supabase = createClient();
      const { error } = await supabase
        .from("partners")
        .update({ contact_name: contactName, phone: form.phone || null, company_name: form.tradingName || null })
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
        <Row label="Years experience" hint="Not stored yet — coming soon">
          <Input value={partner.yearsExperience ? String(partner.yearsExperience) : ""} placeholder="—" suffix="years" />
        </Row>
        <Row label="Public bio" hint="Not stored yet — coming soon">
          <textarea
            value={partner.bio}
            readOnly
            placeholder="Shown on customer-facing reports once we add this field."
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
      const { error } = await createClient()
        .from("partners")
        .update({ trades, trade: primary })
        .eq("id", partner.id);
      if (error) throw error;
      toast({ text: "Trades saved", icon: "check" });
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
export function RatesPage() {
  return (
    <>
      <SettingsHeader title="Rate card" subtitle="What you charge. Customers see totals only; Fixfy never undercuts your rates." />
      <PageCard title="Job types you accept">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ToggleRow on onChange={() => {}} label="Hourly" hint="Default for ad-hoc work" />
          <ToggleRow on onChange={() => {}} label="Day rate" hint="For multi-hour fixed days" />
          <ToggleRow on onChange={() => {}} label="Fixed price" hint="Quoted per-job" />
        </div>
      </PageCard>

      <PageCard title="Rates by trade">
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Trade", "Hourly", "Half-day (4h)", "Day (8h)", "Min call-out"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: 0.4, color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.line}`, textTransform: "uppercase" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Plumbing", 65, 240, 440, 80],
                ["General Maintenance", 45, 170, 320, 60],
                ["Light Carpentry", 50, 190, 360, 65],
              ].map((r) => (
                <tr key={r[0] as string} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 500, color: T.ink }}>{r[0]}</td>
                  <td style={{ padding: "8px" }}><Input value={String(r[1])} prefix="£" suffix="/hr" /></td>
                  <td style={{ padding: "8px" }}><Input value={String(r[2])} prefix="£" /></td>
                  <td style={{ padding: "8px" }}><Input value={String(r[3])} prefix="£" /></td>
                  <td style={{ padding: "8px" }}><Input value={String(r[4])} prefix="£" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard title="Surcharges & fees">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Row label="Emergency surcharge" columns="1fr"><Input value="50" prefix="+%" /></Row>
          <Row label="Out-of-hours window" columns="1fr">
            <div style={{ display: "flex", gap: 8 }}>
              <Input value="18:00" style={{ flex: 1 }} />
              <Input value="07:00" style={{ flex: 1 }} />
              <Input value="35" prefix="+%" style={{ width: 90 }} />
            </div>
          </Row>
          <Row label="Weekend surcharge" columns="1fr"><Input value="25" prefix="+%" /></Row>
          <Row label="Travel beyond 8 mi" columns="1fr"><Input value="0.75" prefix="£" suffix="/mi" /></Row>
        </div>
      </PageCard>

      <Card style={{ padding: 16, background: T.paper, borderColor: T.line, display: "flex", alignItems: "center", gap: 14 }}>
        <Icon name="calculator" size={20} color={T.coral} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>Preview</div>
          <div style={{ fontSize: 12.5, color: T.slate, marginTop: 2 }}>
            Standard <b>2h plumbing call-out</b> in your area: <span className="fx-mono" style={{ color: T.navy, fontWeight: 600 }}>£130 inc VAT</span> · <b>Emergency at 21:30</b>:{" "}
            <span className="fx-mono" style={{ color: T.coral, fontWeight: 600 }}>£275</span>
          </div>
        </div>
      </Card>
    </>
  );
}

// ---------- AVAILABILITY ----------
export function AvailabilityPage() {
  const days = [
    { name: "Mon", on: true, start: "08:00", end: "18:00" },
    { name: "Tue", on: true, start: "08:00", end: "18:00" },
    { name: "Wed", on: true, start: "08:00", end: "18:00" },
    { name: "Thu", on: true, start: "08:00", end: "18:00" },
    { name: "Fri", on: true, start: "08:00", end: "17:00" },
    { name: "Sat", on: true, start: "09:00", end: "14:00" },
    { name: "Sun", on: false, start: "—", end: "—" },
  ];
  return (
    <>
      <SettingsHeader title="Availability" subtitle="When you're working. We only dispatch within these windows." />
      <PageCard title="Working hours">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {days.map((d) => (
            <div
              key={d.name}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 100px 100px",
                gap: 12,
                alignItems: "center",
                padding: "8px 12px",
                background: d.on ? T.white : T.paper,
                borderRadius: 8,
                border: `1px solid ${T.line}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: d.on ? T.ink : T.mute }}>{d.name}</div>
              <Toggle on={d.on} onChange={() => {}} label={d.on ? "Available" : "Day off"} />
              <Input value={d.start} icon="clock" size="sm" />
              <Input value={d.end} icon="clock" size="sm" />
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard title="Defaults & breaks">
        <Row label="Buffer between jobs"><Input value="30" suffix="min" /></Row>
        <Row label="Max jobs per day"><Input value="5" suffix="jobs" /></Row>
        <Row label="Lunch window">
          <div style={{ display: "flex", gap: 8 }}>
            <Input value="12:30" style={{ flex: 1 }} />
            <Input value="13:00" style={{ flex: 1 }} />
          </div>
        </Row>
        <Row label="24/7 emergency call-outs" hint="50% surcharge applied"><Toggle on onChange={() => {}} /></Row>
      </PageCard>
    </>
  );
}

// ---------- SERVICE AREA ----------
export function ServiceAreaPage() {
  const partner = usePartner();
  return (
    <>
      <SettingsHeader title="Service area" subtitle="Where you work. Bigger area = more matches, more drive time." />
      <PageCard title="Coverage">
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row label="Base postcode" columns="1fr"><Input value={partner.postcode} icon="map-pin" placeholder="e.g. SW11 4PG" /></Row>
            <Row label="Radius" columns="1fr">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="range" min={1} max={20} defaultValue={partner.radiusMiles} style={{ flex: 1, accentColor: T.coral }} />
                <span className="fx-mono" style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>
                  {partner.radiusMiles} mi
                </span>
              </div>
            </Row>
            <Row label="Extend for jobs over £" columns="1fr">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle on onChange={() => {}} />
                <Input value="400" prefix="£" suffix="→ 12 mi" />
              </div>
            </Row>
            <Row label="Excluded postcodes" hint="Comma-separated" columns="1fr">
              <Input value="SE1 4, E14 9" />
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
            <div style={{ position: "absolute", bottom: 12, left: 12, padding: "8px 12px", background: T.white, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11.5, color: T.slate, lineHeight: 1.5 }}>
              <div>
                <b>SW11 4PG</b> · 8 mi radius
              </div>
              <div style={{ color: T.mute }}>≈ 290k people · 12 live jobs</div>
            </div>
          </div>
        </div>
      </PageCard>
    </>
  );
}

// ---------- PREFERENCES ----------
function PreferencesPage() {
  return (
    <>
      <SettingsHeader title="Job preferences" subtitle="The kinds of work you want — and don't." />
      <PageCard title="What you accept">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ToggleRow on onChange={() => {}} label="Receive leads" hint="Customer enquiries Fixfy hasn't quoted" />
          <ToggleRow on onChange={() => {}} label="Receive emergency call-outs" hint="Out-of-hours, urgent. 50% surcharge applies" />
          <ToggleRow on={false} onChange={() => {}} label="Receive multi-day jobs (3+ days)" />
          <ToggleRow on={false} onChange={() => {}} label="Insurance / claim work only" />
        </div>
      </PageCard>
      <PageCard title="Limits">
        <Row label="Minimum job value"><Input value="80" prefix="£" /></Row>
        <Row label="Max simultaneous active jobs"><Input value="6" suffix="jobs" /></Row>
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
              {([
                ["New lead matched", true, true, false],
                ["Emergency near you", true, true, true],
                ["Job assigned to you", true, true, true],
                ["Quote accepted", true, false, false],
                ["Customer signed off", true, false, false],
                ["Self-bill issued", true, false, false],
                ["Document expiring", true, false, false],
                ["New review", true, true, false],
              ] as [string, boolean, boolean, boolean][]).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "12px", fontSize: 13, color: T.ink }}>{row[0]}</td>
                  <td style={{ padding: "8px 12px" }}><Toggle on={row[1]} onChange={() => {}} /></td>
                  <td style={{ padding: "8px 12px" }}><Toggle on={row[2]} onChange={() => {}} /></td>
                  <td style={{ padding: "8px 12px" }}><Toggle on={row[3]} onChange={() => {}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
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
function PoliciesPage() {
  const policies = [
    { name: "Cancellation policy", accepted: "22 May 2026", icon: "x-circle" },
    { name: "No-show policy", accepted: "22 May 2026", icon: "ban" },
    { name: "Payment terms", accepted: "22 May 2026", icon: "banknote" },
    { name: "Conduct standards", accepted: "22 May 2026", icon: "handshake" },
    { name: "Insurance requirements", accepted: "22 May 2026", icon: "umbrella" },
    { name: "Strikes & ratings", accepted: "22 May 2026", icon: "shield" },
  ];
  return (
    <>
      <SettingsHeader title="Policies" subtitle="The rules of the road. Fixfy may update these — you'll be re-prompted to accept." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {policies.map((p) => (
          <Card key={p.name} style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: T.paper2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={p.icon} size={18} color={T.navy} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>v3.2 · accepted {p.accepted}</div>
            </div>
            <Button variant="ghost" size="sm" iconRight="arrow-up-right">Read</Button>
          </Card>
        ))}
      </div>
    </>
  );
}
