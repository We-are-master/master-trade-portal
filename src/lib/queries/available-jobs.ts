// Reads the partner's open auto-assign job offers → the portal's AvailableJob UI type.
//
// Two visibility paths, mirroring quotes.ts:
//   1. Explicit invite — this partner is in auto_assign_invited_partner_ids (the email
//      Job Offer went to them).
//   2. Broadcast by type of work (Fase 2 do auto-flow) — ANY auto_assigning job whose
//      catalog service matches the partner's catalog_service_ids (or, fuzzy, their trades)
//      shows in the vitrine, even for partners activated after the invites went out.
//      Acceptance is re-validated server-side (master-os processAutoAssignJobAccept), so
//      this filter is display, not authorization.
// First partner to accept wins (see /api/jobs/accept). There's no per-job "emergency"
// flag in the schema, so emergency stays false.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailableJob, Trade } from "@/types";
import { tradeMatchesService } from "@/lib/trade-match";
import { isDemoMode } from "@/lib/demo/demo-mode";
import { DEMO_AVAILABLE_JOBS } from "@/lib/demo/demo-data";

export const AVAILABLE_JOB_SELECT =
  // "*" de propósito: rate_basis (mig 281 do master-os) pode ainda não existir
  // no banco, e um select explícito com coluna ausente derruba a vitrine.
  "*, catalog_service:catalog_service_id(name)";

interface AvailableJobRow {
  id: string;
  reference: string | null;
  title: string | null;
  scope: string | null;
  additional_notes: string | null;
  job_type: string | null;
  property_address: string | null;
  partner_cost: number | null;
  partner_agreed_value: number | null;
  client_price: number | null;
  scheduled_date: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  created_at: string | null;
  rate_basis: string | null;
  catalog_service_id: string | null;
  auto_assign_invited_partner_ids: string[] | null;
  /** PostgREST embed of the linked service_catalog row (name only). */
  catalog_service: { name: string | null } | null;
}

const LONDON = "Europe/London";
function extractPostcode(address: string | null): string {
  if (!address) return "";
  const m = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return m ? m[1].toUpperCase() : "";
}
function durationLabel(row: AvailableJobRow): string {
  if (!row.scheduled_start_at || !row.scheduled_end_at) return "Flexible";
  const hours = (new Date(row.scheduled_end_at).getTime() - new Date(row.scheduled_start_at).getTime()) / 3_600_000;
  if (hours <= 0) return "Flexible";
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours.toFixed(1)} hours`;
}
function timingLabel(date: string | null): string {
  if (!date) return "ASAP";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON });
}
export function mapAvailableJob(row: AvailableJobRow): AvailableJob {
  return {
    id: row.id,
    reference: row.reference ?? undefined,
    title: row.title || "Job",
    desc: row.scope || row.additional_notes || "",
    // The trade chip shows the type of work (catalog name or canonical title).
    // jobs.job_type is the RATE type ("hourly"/"fixed") — never a trade.
    trade: (row.catalog_service?.name?.trim() || row.title || "General Maintenance") as Trade,
    emergency: false, // no emergency flag in the schema
    postcode: extractPostcode(row.property_address),
    distance: 0, // no partner-relative geo distance
    duration: durationLabel(row),
    total: row.partner_cost ?? row.partner_agreed_value ?? row.client_price ?? 0,
    rateBasisLabel: row.rate_basis === "daily" ? "Day rate" : row.rate_basis === "half_day" ? "Half day" : null,
    timing: timingLabel(row.scheduled_date),
  };
}

export async function fetchAvailableJobs(supabase: SupabaseClient, partnerId: string): Promise<AvailableJob[]> {
  if (isDemoMode()) return DEMO_AVAILABLE_JOBS;

  // Partner's type-of-work profile for the broadcast filter (same shape quotes.ts uses).
  const { data: prow } = await supabase
    .from("partners")
    .select("catalog_service_ids, trades")
    .eq("id", partnerId)
    .maybeSingle();
  const partnerCatalogIds = new Set(
    ((prow as { catalog_service_ids: string[] | null } | null)?.catalog_service_ids ?? []).filter(Boolean),
  );
  const partnerTrades = (
    ((prow as { trades: string[] | null } | null)?.trades ?? []) as string[]
  ).filter(Boolean);

  // Every open auto-assign job; visibility is decided per row below.
  const { data, error } = await supabase
    .from("jobs")
    .select(AVAILABLE_JOB_SELECT)
    .eq("status", "auto_assigning")
    .is("partner_id", null)
    .is("deleted_at", null);
  if (error) throw error;
  const raw = (data ?? []) as unknown as AvailableJobRow[];

  // Jobs this partner declined (or lost) never come back to their vitrine.
  // Read via our own API because job_partner_invites is staff-only under RLS.
  // Degrades open on failure: a fetch hiccup shows the job again rather than
  // hiding real offers.
  let declinedIds = new Set<string>();
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/jobs/declined");
      const json = (await res.json().catch(() => ({}))) as { jobIds?: string[] };
      declinedIds = new Set(json.jobIds ?? []);
    } catch {
      /* keep empty */
    }
  }

  const visible = raw.filter((row) => {
    if (declinedIds.has(row.id)) return false;
    if ((row.auto_assign_invited_partner_ids ?? []).includes(partnerId)) return true;
    if (row.catalog_service_id && partnerCatalogIds.has(row.catalog_service_id)) return true;
    const workLabel = row.catalog_service?.name?.trim() || row.title?.trim() || "";
    return Boolean(workLabel) && partnerTrades.some((t) => tradeMatchesService(t, workLabel));
  });

  return visible
    .sort((a, b) => {
      const aKey = a.scheduled_date ?? a.created_at ?? "";
      const bKey = b.scheduled_date ?? b.created_at ?? "";
      if (!aKey && !bKey) return 0;
      if (!aKey) return 1;
      if (!bKey) return -1;
      return aKey.localeCompare(bKey);
    })
    .map(mapAvailableJob);
}
