"use client";

// Rate card editor: for every service the partner does, our standard pay per
// band and per add-on, and the option to set their own. Shared by the
// /get-started funnel (step right after their details) and Settings > Rate card.
// Own rates are saved as partner_service_prices.preset_overrides /
// addon_overrides, which the OS reads when it prices a job for this partner.

import { useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";
import { formatGBPdec } from "@/lib/format";
import { SERVICE_CATEGORY_ORDER, serviceCategory } from "@/lib/service-category";
import type { ServicePrice } from "@/lib/queries/rate-card";

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(/[^0-9.]/g, "")) || 0);
const money = (n: number) => (Number.isInteger(n) ? `£${n}` : formatGBPdec(n));

/** "Half day (up to 3.5 hours)" → title "Half day", detail "up to 3.5 hours". */
function splitLabel(label: string): { title: string; detail: string | null } {
  const m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { title: m[1], detail: m[2] } : { title: label, detail: null };
}

type Tile = { id: string; label: string; standard: number; hourly: boolean };

export function RateCardEditor({
  rows,
  onChange,
}: {
  rows: ServicePrice[];
  onChange: (rows: ServicePrice[]) => void;
}) {
  const update = (catalogServiceId: string, patch: Partial<ServicePrice>) =>
    onChange(rows.map((r) => (r.catalogServiceId === catalogServiceId ? { ...r, ...patch } : r)));

  const setStandard = (r: ServicePrice, useStandard: boolean) => {
    if (useStandard) return update(r.catalogServiceId, { useStandard: true });
    // Start their own card from our numbers so they only change what they disagree with.
    const seed = (list: { id: string; partner_cost?: number }[], current: Record<string, number | null>) =>
      Object.fromEntries(list.map((x) => [x.id, current[x.id] ?? x.partner_cost ?? null]));
    update(r.catalogServiceId, {
      useStandard: false,
      bandOverrides: seed(r.bands, r.bandOverrides),
      addonOverrides: seed(r.addons, r.addonOverrides),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, textAlign: "left" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <HowCard
          icon="check"
          tone={T.green}
          tint={T.green50}
          title="Our rates"
          body="Take our standard pay and pre-paid jobs come to you first: 76% more likely to be chosen."
        />
        <HowCard
          icon="pencil"
          tone={T.coral}
          tint={T.coralTint}
          title="Your own rates"
          body="Prefer a different price? Set it per job type below and we offer you the jobs that fit it."
        />
      </div>

      {SERVICE_CATEGORY_ORDER.map((cat) => {
        const catRows = rows.filter((r) => serviceCategory(r.name) === cat);
        if (catRows.length === 0) return null;
        return (
          <section key={cat}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.mute }}>{cat}</span>
              <span style={{ flex: 1, height: 1, background: T.line, alignSelf: "center" }} />
            </div>
            {cat === "Trades" && (
              <p style={{ margin: "-2px 0 12px", fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
                Fixed pay per visit, shown before you accept. Job bigger than a day? Send us your quote from the portal.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {catRows.map((r) => (
                <ServiceCard
                  key={r.catalogServiceId}
                  r={r}
                  onStandard={(v) => setStandard(r, v)}
                  onPatch={(p) => update(r.catalogServiceId, p)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ServiceCard({
  r,
  onStandard,
  onPatch,
}: {
  r: ServicePrice;
  onStandard: (v: boolean) => void;
  onPatch: (p: Partial<ServicePrice>) => void;
}) {
  const [extrasOpen, setExtrasOpen] = useState(false);
  const own = !r.useStandard;
  const cleaning = serviceCategory(r.name) === "Cleaning";

  // Services without bands still have one rate: show it as a single tile.
  const tiles: Tile[] =
    r.bands.length > 0
      ? r.bands.map((b) => ({ id: b.id, label: b.label, standard: b.partner_cost ?? 0, hourly: b.pricing_mode === "hourly" }))
      : [
          {
            id: "__single",
            label: r.mode === "hourly" ? "Hourly" : "Per job",
            standard: r.mode === "hourly" ? r.standardPayHourly : r.standardPayFixed,
            hourly: r.mode === "hourly",
          },
        ];
  const tileValue = (t: Tile): number | null =>
    t.id === "__single" ? (r.mode === "hourly" ? r.hourlyPartnerRate : r.fixedPartnerCost) : r.bandOverrides[t.id] ?? null;
  const setTile = (t: Tile, v: number | null) =>
    t.id === "__single"
      ? onPatch(r.mode === "hourly" ? { hourlyPartnerRate: v } : { fixedPartnerCost: v })
      : onPatch({ bandOverrides: { ...r.bandOverrides, [t.id]: v } });

  return (
    <div
      style={{
        border: `1.5px solid ${own ? T.coral : T.line}`,
        borderRadius: 14,
        background: T.white,
        overflow: "hidden",
        transition: `border-color 160ms ${T.ease}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.25 }}>{r.name}</div>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 3, lineHeight: 1.3 }}>{cleaning ? "Paid per clean, by size" : "Paid by time on site"}</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <Segmented own={own} onChange={(o) => onStandard(!o)} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${cleaning ? 120 : 92}px, 1fr))`,
          gap: 8,
          padding: "0 16px 14px",
        }}
      >
        {tiles.map((t) => (
          <RateTile key={t.id} tile={t} own={own} value={tileValue(t)} onValue={(v) => setTile(t, v)} />
        ))}
      </div>

      {r.addons.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.line}`, background: T.paper }}>
          <button
            type="button"
            onClick={() => setExtrasOpen((o) => !o)}
            aria-expanded={extrasOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "11px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: T.sans,
              fontSize: 12.5,
              fontWeight: 600,
              color: T.slate,
              textAlign: "left",
            }}
          >
            <Icon name={extrasOpen ? "chevron-down" : "chevron-right"} size={14} color={T.mute} />
            Extras paid on top ({r.addons.length})
            <span style={{ marginLeft: "auto", fontWeight: 400, color: T.mute }}>
              {extrasOpen ? "Hide" : own ? "Set your prices" : "See prices"}
            </span>
          </button>
          {extrasOpen && (
            <div style={{ padding: "0 16px 10px" }}>
              {r.addons.map((a) => (
                <ExtraRow
                  key={a.id}
                  label={a.label}
                  standard={a.partner_cost ?? 0}
                  own={own}
                  value={r.addonOverrides[a.id] ?? null}
                  onValue={(v) => onPatch({ addonOverrides: { ...r.addonOverrides, [a.id]: v } })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!own && (
        <button
          type="button"
          onClick={() => onStandard(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            padding: "10px 16px",
            border: "none",
            borderTop: `1px solid ${T.line}`,
            background: T.white,
            cursor: "pointer",
            fontFamily: T.sans,
            fontSize: 12.5,
            color: T.coral,
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          <Icon name="pencil" size={13} color={T.coral} />
          Prefer a different price? Set your own
        </button>
      )}
    </div>
  );
}

function Segmented({ own, onChange }: { own: boolean; onChange: (own: boolean) => void }) {
  const opt = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "none",
        background: active ? T.white : "transparent",
        boxShadow: active ? "0 1px 2px rgba(2,0,64,0.12), 0 0 0 1px rgba(2,0,64,0.06)" : "none",
        color: active ? (own ? T.coral : T.navy) : T.mute,
        fontFamily: T.sans,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Rates" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: T.paper2 }}>
      {opt(!own, "Our rates", () => onChange(false))}
      {opt(own, "Set my own", () => onChange(true))}
    </div>
  );
}

function RateTile({
  tile,
  own,
  value,
  onValue,
}: {
  tile: Tile;
  own: boolean;
  value: number | null;
  onValue: (v: number | null) => void;
}) {
  const { title, detail } = splitLabel(tile.label);
  const unit = tile.hourly ? "/hr" : "";
  const diff = value != null ? value - tile.standard : 0;

  return (
    <div
      style={{
        borderRadius: 10,
        padding: "10px 12px",
        background: own ? T.white : T.paper,
        border: `1px solid ${own ? T.lineStrong : "transparent"}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: T.slate, lineHeight: 1.3 }}>{title}</div>
      {own ? (
        <label style={{ display: "flex", alignItems: "baseline", gap: 2, borderBottom: `1.5px solid ${T.coral}`, paddingBottom: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: 15, color: T.mute }}>£</span>
          <input
            inputMode="decimal"
            aria-label={`Your rate, ${tile.label}`}
            value={value != null ? String(value) : ""}
            placeholder={String(tile.standard)}
            onChange={(e) => onValue(num(e.target.value))}
            style={{
              width: "100%",
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: T.mono,
              fontSize: 19,
              fontWeight: 600,
              color: T.ink,
              padding: 0,
            }}
          />
          {unit && <span style={{ fontSize: 11, color: T.mute }}>{unit}</span>}
        </label>
      ) : (
        <div style={{ fontFamily: T.mono, fontSize: 19, fontWeight: 600, color: T.ink }}>
          {money(tile.standard)}
          {unit && <span style={{ fontSize: 11, fontWeight: 400, color: T.mute }}>{unit}</span>}
        </div>
      )}
      <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.35 }}>
        {own ? <Delta diff={diff} standard={tile.standard} unit={unit} /> : detail ?? " "}
      </div>
    </div>
  );
}

function Delta({ diff, standard, unit }: { diff: number; standard: number; unit: string }) {
  if (diff > 0)
    return (
      <span style={{ color: T.coral }}>
        Above ours ({money(standard)}
        {unit}), capped
      </span>
    );
  if (diff < 0)
    return (
      <span style={{ color: T.green }}>
        {money(-diff)} below ours
      </span>
    );
  return (
    <span>
      Ours {money(standard)}
      {unit}
    </span>
  );
}

function ExtraRow({
  label,
  standard,
  own,
  value,
  onValue,
}: {
  label: string;
  standard: number;
  own: boolean;
  value: number | null;
  onValue: (v: number | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: `1px dashed ${T.line}`, fontSize: 12.5 }}>
      <span style={{ flex: 1, color: T.slate, minWidth: 0 }}>{label}</span>
      {own ? (
        <>
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>ours {money(standard)}</span>
          <label style={{ display: "inline-flex", alignItems: "baseline", gap: 2, borderBottom: `1.5px solid ${T.coral}`, width: 64 }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute }}>£</span>
            <input
              inputMode="decimal"
              aria-label={`Your rate, ${label}`}
              value={value != null ? String(value) : ""}
              placeholder={String(standard)}
              onChange={(e) => onValue(num(e.target.value))}
              style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink, padding: 0 }}
            />
          </label>
        </>
      ) : (
        <span style={{ fontFamily: T.mono, fontWeight: 600, color: T.ink }}>{money(standard)}</span>
      )}
    </div>
  );
}

function HowCard({ icon, tone, tint, title, body }: { icon: string; tone: string; tint: string; title: string; body: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: tint }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: T.white,
          color: tone,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: T.slate, marginTop: 2, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}
