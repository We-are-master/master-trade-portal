// Maps real Fixfy OS `self_bills` rows → the portal's self-bill row UI type.
// One self-bill per partner per ISO week. There is no VAT column on self_bills, so the
// portal surfaces job value + net payout (net_payout) rather than a fabricated VAT line.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo/demo-mode";
import { demoSelfBills } from "@/lib/demo/demo-data";

export const SELF_BILL_SELECT = [
  "id",
  "reference",
  "period",
  "week_label",
  "week_start",
  "week_end",
  "jobs_count",
  "job_value",
  "materials",
  "commission",
  "net_payout",
  "status",
  "pdf_generated_at",
  "created_at",
].join(",");

export interface SelfBillRow {
  id: string;
  reference: string | null;
  period: string | null;
  week_label: string | null;
  week_start: string | null;
  week_end: string | null;
  jobs_count: number | null;
  job_value: number | null;
  materials: number | null;
  commission: number | null;
  net_payout: number | null;
  status: string | null;
  pdf_generated_at: string | null;
  created_at: string | null;
}

export type SelfBillTone = "success" | "warning" | "danger" | "neutral";

export interface SelfBill {
  id: string;
  reference: string;
  issued: string; // formatted date
  period: string;
  jobs: number;
  value: number; // job_value + materials
  net: number; // net_payout
  statusLabel: string;
  tone: SelfBillTone;
  hasPdf: boolean;
  isAccumulating: boolean;
}

const LONDON = "Europe/London";
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: LONDON });
}
function fmtDayMonth(date: string | null): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: LONDON });
}

const TONE_BY_STATUS: Record<string, SelfBillTone> = {
  paid: "success",
  payment_sent: "success",
  ready_to_pay: "success",
  awaiting_payment: "warning",
  pending_review: "warning",
  accumulating: "neutral",
  generated: "neutral",
  payout_archived: "neutral",
  audit_required: "danger",
  needs_attention: "danger",
  rejected: "danger",
  payout_cancelled: "danger",
  payout_lost: "danger",
};

function prettyStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function mapSelfBill(row: SelfBillRow): SelfBill {
  const status = row.status ?? "generated";
  const periodLabel =
    row.period ||
    (row.week_start && row.week_end ? `${fmtDayMonth(row.week_start)} – ${fmtDayMonth(row.week_end)}` : row.week_label || "—");
  return {
    id: row.id,
    reference: row.reference || row.id,
    issued: fmtDate(row.pdf_generated_at || row.created_at),
    period: periodLabel,
    jobs: row.jobs_count ?? 0,
    value: (row.job_value ?? 0) + (row.materials ?? 0),
    net: row.net_payout ?? 0,
    statusLabel: prettyStatus(status),
    tone: TONE_BY_STATUS[status] ?? "neutral",
    hasPdf: !!row.pdf_generated_at,
    isAccumulating: status === "accumulating",
  };
}

export async function fetchSelfBills(supabase: SupabaseClient, partnerId: string): Promise<SelfBill[]> {
  if (isDemoMode()) return demoSelfBills();
  const { data, error } = await supabase
    .from("self_bills")
    .select(SELF_BILL_SELECT)
    .eq("partner_id", partnerId)
    .order("week_start", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as SelfBillRow[]).map(mapSelfBill);
}
