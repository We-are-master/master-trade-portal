// Partner rate card, driven by the partner's TRADES: shows the service_catalog services that
// match their trades (by name, the same link the OS uses for partners.catalog_service_ids — see
// master-os migration 173) and lets them price each — catalog standard or their own override.
// Prices persist in partner_service_prices (one row per partner × catalog service).

import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogPartnerHourlyRate } from "@/lib/catalog-partner-pay";
import {
  parsePricingAddons,
  parsePricingPresets,
  type ServicePricingAddon,
  type ServicePricingPreset,
} from "@/lib/catalog-pricing";
import { serviceMatchesAnyTrade } from "@/lib/trade-match";

interface CatalogRow {
  id: string;
  name: string | null;
  pricing_mode: string | null;
  partner_cost: number | null;
  default_hours: number | null;
  pricing_presets: unknown;
  pricing_addons: unknown;
}
interface PSPRow {
  id: string;
  catalog_service_id: string;
  use_standard: boolean | null;
  fixed_partner_cost: number | null;
  hourly_partner_rate: number | null;
  default_hours: number | null;
  preset_overrides: Record<string, { partner_cost?: number | null }> | null;
  addon_overrides: Record<string, { partner_cost?: number | null }> | null;
}

export interface ServicePrice {
  pspId: string | null; // partner_service_prices.id — null until first priced
  catalogServiceId: string;
  name: string;
  mode: "fixed" | "hourly";
  standardHours: number;
  /** Catalog partner pay from service_catalog.partner_cost (fixed total or hourly bundle). */
  standardPayFixed: number;
  /** Hourly partner rate derived from partner_cost ÷ default_hours. */
  standardPayHourly: number;
  useStandard: boolean;
  fixedPartnerCost: number | null;
  hourlyPartnerRate: number | null;
  defaultHours: number | null;
  bands: ServicePricingPreset[]; // pricing_presets, each with our standard partner_cost
  /** Own pay per band (preset id → £), when useStandard is off. The OS reads it as preset_overrides. */
  bandOverrides: Record<string, number | null>;
  addons: ServicePricingAddon[]; // pricing_addons, each with our standard partner_cost
  /** Own pay per add-on (addon id → £), when useStandard is off. The OS reads it as addon_overrides. */
  addonOverrides: Record<string, number | null>;
}

/** service_catalog ids whose name matches one of the partner's trades (fuzzy: profession ⇄ activity). */
export async function catalogIdsForTrades(supabase: SupabaseClient, trades: string[]): Promise<string[]> {
  if (trades.length === 0) return [];
  const { data } = await supabase.from("service_catalog").select("id, name").is("deleted_at", null);
  return ((data ?? []) as { id: string; name: string | null }[])
    .filter((c) => serviceMatchesAnyTrade(c.name ?? "", trades))
    .map((c) => c.id);
}

/**
 * The partner's rate card. By default the services come from their trades (fuzzy
 * name match); the /get-started funnel passes `catalogIds` instead, the exact
 * services they ticked in step 1.
 */
export async function fetchRateCard(
  supabase: SupabaseClient,
  partnerId: string,
  trades: string[],
  opts: { catalogIds?: string[] } = {},
): Promise<ServicePrice[]> {
  const byIds = opts.catalogIds && opts.catalogIds.length > 0 ? new Set(opts.catalogIds) : null;
  if (!byIds && trades.length === 0) return [];

  const { data: cats } = await supabase
    .from("service_catalog")
    .select("id,name,pricing_mode,partner_cost,default_hours,pricing_presets,pricing_addons")
    .is("deleted_at", null)
    .eq("is_active", true);
  const matching = ((cats ?? []) as CatalogRow[]).filter((c) =>
    byIds ? byIds.has(c.id) : serviceMatchesAnyTrade(c.name ?? "", trades),
  );

  const { data: psps } = await supabase
    .from("partner_service_prices")
    .select("id,catalog_service_id,use_standard,fixed_partner_cost,hourly_partner_rate,default_hours,preset_overrides,addon_overrides")
    .eq("partner_id", partnerId)
    .is("deleted_at", null);
  const byCat = new Map(((psps ?? []) as PSPRow[]).map((p) => [p.catalog_service_id, p]));

  return matching
    .map((c) => {
      const p = byCat.get(c.id);
      const standardHours = c.default_hours ?? 1;
      const standardPayFixed = c.partner_cost ?? 0;
      const standardPayHourly = catalogPartnerHourlyRate(c.partner_cost, standardHours);
      return {
        pspId: p?.id ?? null,
        catalogServiceId: c.id,
        name: c.name || "Service",
        mode: (c.pricing_mode === "hourly" ? "hourly" : "fixed") as "fixed" | "hourly",
        standardHours,
        standardPayFixed,
        standardPayHourly,
        useStandard: p?.use_standard ?? true,
        fixedPartnerCost: p?.fixed_partner_cost ?? null,
        hourlyPartnerRate: p?.hourly_partner_rate ?? null,
        defaultHours: p?.default_hours ?? null,
        bands: parsePricingPresets(c.pricing_presets),
        bandOverrides: Object.fromEntries(
          Object.entries(p?.preset_overrides ?? {}).map(([id, o]) => [id, o?.partner_cost ?? null]),
        ),
        addons: parsePricingAddons(c.pricing_addons),
        addonOverrides: Object.fromEntries(
          Object.entries(p?.addon_overrides ?? {}).map(([id, o]) => [id, o?.partner_cost ?? null]),
        ),
      } satisfies ServicePrice;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const overridesJson = (use: boolean, map: Record<string, number | null>) =>
  use
    ? {}
    : Object.fromEntries(
        Object.entries(map)
          .filter(([, v]) => v != null && v > 0)
          .map(([id, v]) => [id, { partner_cost: v }]),
      );

/**
 * Partner can undercut catalog pay but never exceed it: every own rate (single
 * rate, each band, each add-on) is capped at the standard it replaces.
 */
export function clampRateCard(rows: ServicePrice[]): ServicePrice[] {
  const cap = (v: number | null | undefined, ceiling: number | null | undefined): number | null =>
    v == null ? null : ceiling != null && ceiling > 0 ? Math.min(Math.max(0, v), ceiling) : Math.max(0, v);
  return rows.map((r) => ({
    ...r,
    fixedPartnerCost: cap(r.fixedPartnerCost, r.standardPayFixed),
    hourlyPartnerRate: cap(r.hourlyPartnerRate, r.standardPayHourly),
    bandOverrides: Object.fromEntries(r.bands.map((b) => [b.id, cap(r.bandOverrides[b.id], b.partner_cost)])),
    addonOverrides: Object.fromEntries(r.addons.map((a) => [a.id, cap(r.addonOverrides[a.id], a.partner_cost)])),
  }));
}

/**
 * Upsert each row into partner_service_prices. Existing rows are looked up by
 * (partner, service) rather than trusting `pspId`, so the funnel can save the
 * same card more than once without tripping the one-live-row unique index.
 */
export async function saveRateCard(supabase: SupabaseClient, partnerId: string, rows: ServicePrice[]): Promise<void> {
  const { data: existing, error: exErr } = await supabase
    .from("partner_service_prices")
    .select("id,catalog_service_id")
    .eq("partner_id", partnerId)
    .is("deleted_at", null);
  if (exErr) throw exErr;
  const idByCat = new Map(((existing ?? []) as { id: string; catalog_service_id: string }[]).map((e) => [e.catalog_service_id, e.id]));

  for (const r of rows) {
    const payload = {
      partner_id: partnerId,
      catalog_service_id: r.catalogServiceId,
      use_standard: r.useStandard,
      fixed_partner_cost: !r.useStandard && r.mode === "fixed" ? r.fixedPartnerCost : null,
      hourly_partner_rate: !r.useStandard && r.mode === "hourly" ? r.hourlyPartnerRate : null,
      default_hours: r.mode === "hourly" ? r.defaultHours : null,
      preset_overrides: overridesJson(r.useStandard, r.bandOverrides),
      addon_overrides: overridesJson(r.useStandard, r.addonOverrides),
      updated_at: new Date().toISOString(),
    };
    const id = r.pspId ?? idByCat.get(r.catalogServiceId);
    if (id) {
      const { error } = await supabase.from("partner_service_prices").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("partner_service_prices").insert(payload);
      if (error) throw error;
    }
  }
}
