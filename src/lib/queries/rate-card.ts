// Partner rate card, driven by the partner's TRADES: shows the service_catalog services that
// match their trades (by name, the same link the OS uses for partners.catalog_service_ids — see
// master-os migration 173) and lets them price each — catalog standard or their own override.
// Prices persist in partner_service_prices (one row per partner × catalog service).

import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceMatchesAnyTrade } from "@/lib/trade-match";

interface CatalogRow {
  id: string;
  name: string | null;
  pricing_mode: string | null;
  fixed_price: number | null;
  hourly_rate: number | null;
  default_hours: number | null;
}
interface PSPRow {
  id: string;
  catalog_service_id: string;
  use_standard: boolean | null;
  fixed_partner_cost: number | null;
  hourly_partner_rate: number | null;
  default_hours: number | null;
}

export interface ServicePrice {
  pspId: string | null; // partner_service_prices.id — null until first priced
  catalogServiceId: string;
  name: string;
  mode: "fixed" | "hourly";
  standardFixed: number;
  standardHourly: number;
  standardHours: number;
  useStandard: boolean;
  fixedPartnerCost: number | null;
  hourlyPartnerRate: number | null;
  defaultHours: number | null;
}

/** service_catalog ids whose name matches one of the partner's trades (fuzzy: profession ⇄ activity). */
export async function catalogIdsForTrades(supabase: SupabaseClient, trades: string[]): Promise<string[]> {
  if (trades.length === 0) return [];
  const { data } = await supabase.from("service_catalog").select("id, name").is("deleted_at", null);
  return ((data ?? []) as { id: string; name: string | null }[])
    .filter((c) => serviceMatchesAnyTrade(c.name ?? "", trades))
    .map((c) => c.id);
}

export async function fetchRateCard(supabase: SupabaseClient, partnerId: string, trades: string[]): Promise<ServicePrice[]> {
  if (trades.length === 0) return [];

  const { data: cats } = await supabase
    .from("service_catalog")
    .select("id,name,pricing_mode,fixed_price,hourly_rate,default_hours")
    .is("deleted_at", null)
    .eq("is_active", true);
  const matching = ((cats ?? []) as CatalogRow[]).filter((c) => serviceMatchesAnyTrade(c.name ?? "", trades));

  const { data: psps } = await supabase
    .from("partner_service_prices")
    .select("id,catalog_service_id,use_standard,fixed_partner_cost,hourly_partner_rate,default_hours")
    .eq("partner_id", partnerId)
    .is("deleted_at", null);
  const byCat = new Map(((psps ?? []) as PSPRow[]).map((p) => [p.catalog_service_id, p]));

  return matching
    .map((c) => {
      const p = byCat.get(c.id);
      return {
        pspId: p?.id ?? null,
        catalogServiceId: c.id,
        name: c.name || "Service",
        mode: (c.pricing_mode === "hourly" ? "hourly" : "fixed") as "fixed" | "hourly",
        standardFixed: c.fixed_price ?? 0,
        standardHourly: c.hourly_rate ?? 0,
        standardHours: c.default_hours ?? 1,
        useStandard: p?.use_standard ?? true,
        fixedPartnerCost: p?.fixed_partner_cost ?? null,
        hourlyPartnerRate: p?.hourly_partner_rate ?? null,
        defaultHours: p?.default_hours ?? null,
      } satisfies ServicePrice;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Upsert each row into partner_service_prices (insert when not yet priced, else update). */
export async function saveRateCard(supabase: SupabaseClient, partnerId: string, rows: ServicePrice[]): Promise<void> {
  for (const r of rows) {
    const payload = {
      partner_id: partnerId,
      catalog_service_id: r.catalogServiceId,
      use_standard: r.useStandard,
      fixed_partner_cost: !r.useStandard && r.mode === "fixed" ? r.fixedPartnerCost : null,
      hourly_partner_rate: !r.useStandard && r.mode === "hourly" ? r.hourlyPartnerRate : null,
      default_hours: r.mode === "hourly" ? r.defaultHours : null,
      updated_at: new Date().toISOString(),
    };
    if (r.pspId) {
      const { error } = await supabase.from("partner_service_prices").update(payload).eq("id", r.pspId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("partner_service_prices").insert(payload);
      if (error) throw error;
    }
  }
}
