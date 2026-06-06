// Reads the partner's open auto-assign job offers → the portal's AvailableJob UI type.
//
// The OS broadcasts a job to matching partners by setting status='auto_assigning' and listing
// them in auto_assign_invited_partner_ids (migration 080). RLS (migration 081) lets an invited
// partner SELECT those rows while partner_id IS NULL. First partner to accept wins (see
// /api/jobs/accept). There's no per-job "emergency" flag in the schema, so emergency stays false;
// Jobs use first-to-accept-wins (no per-offer expiry UI in the portal).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailableJob, Trade } from "@/types";

export const AVAILABLE_JOB_SELECT = [
  "id",
  "reference",
  "title",
  "scope",
  "additional_notes",
  "job_type",
  "property_address",
  "partner_cost",
  "partner_agreed_value",
  "client_price",
  "scheduled_date",
  "scheduled_start_at",
  "scheduled_end_at",
  "created_at",
].join(",");

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
    trade: (row.job_type || "General Maintenance") as Trade,
    emergency: false, // no emergency flag in the schema
    postcode: extractPostcode(row.property_address),
    distance: 0, // no partner-relative geo distance
    duration: durationLabel(row),
    total: row.partner_cost ?? row.partner_agreed_value ?? row.client_price ?? 0,
    timing: timingLabel(row.scheduled_date),
  };
}

export async function fetchAvailableJobs(supabase: SupabaseClient, partnerId: string): Promise<AvailableJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(AVAILABLE_JOB_SELECT)
    .eq("status", "auto_assigning")
    .is("partner_id", null)
    .contains("auto_assign_invited_partner_ids", [partnerId])
    .is("deleted_at", null);
  if (error) throw error;
  const raw = (data ?? []) as unknown as AvailableJobRow[];
  return raw
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
