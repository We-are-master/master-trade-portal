// Maps a real Fixfy OS `jobs` row → the portal's `MyJob` UI type.
//
// The jobs table is wide (138 cols); we select only what the portal needs (JOB_SELECT).
// Checklist/photo tables don't exist yet, so those counts are placeholders (0) — the
// drawer's Checklist/Photos tabs stay empty for real jobs until those tables land.

import type { Customer, JobSource, JobStatus, MyJob, Trade } from "@/types";

export const JOB_SELECT = [
  "id",
  "reference",
  "title",
  "scope",
  "additional_notes",
  "internal_notes",
  "job_type",
  "client_id",
  "client_name",
  "property_address",
  "status",
  "progress",
  "client_price",
  "partner_cost",
  "partner_agreed_value",
  "materials_cost",
  "vat",
  "scheduled_date",
  "scheduled_start_at",
  "scheduled_end_at",
  "scheduled_finish_date",
  "completed_date",
  "report_submitted",
  "report_notes",
  "final_report_submitted",
  "customer_review_rating",
  "customer_review_comment",
  "quote_id",
  "in_ccz",
  "has_free_parking",
  "latitude",
  "longitude",
  "images",
  "partner_timer_started_at",
  "partner_timer_ended_at",
  "partner_timer_accum_paused_ms",
  "partner_timer_is_paused",
  "partner_timer_pause_began_at",
].join(",");

export interface JobRow {
  id: string;
  reference: string | null;
  title: string | null;
  scope: string | null;
  additional_notes: string | null;
  internal_notes: string | null;
  job_type: string | null;
  client_id: string | null;
  client_name: string | null;
  property_address: string | null;
  status: string;
  progress: number | null;
  client_price: number | null;
  partner_cost: number | null;
  partner_agreed_value: number | null;
  materials_cost: number | null;
  vat: number | null;
  scheduled_date: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_finish_date: string | null;
  completed_date: string | null;
  report_submitted: boolean | null;
  report_notes: string | null;
  final_report_submitted: boolean | null;
  customer_review_rating: number | null;
  customer_review_comment: string | null;
  quote_id: string | null;
  in_ccz: boolean | null;
  has_free_parking: boolean | null;
  latitude: number | null;
  longitude: number | null;
  images: unknown[] | null;
  partner_timer_started_at: string | null;
  partner_timer_ended_at: string | null;
  partner_timer_accum_paused_ms: number | null;
  partner_timer_is_paused: boolean | null;
  partner_timer_pause_began_at: string | null;
}

const STATUS_MAP: Record<string, JobStatus> = {
  scheduled: "scheduled",
  on_hold: "scheduled",
  unassigned: "scheduled",
  auto_assigning: "scheduled",
  in_progress: "in_progress",
  late: "in_progress",
  final_check: "final_check",
  awaiting_payment: "final_check",
  completed: "completed",
  cancelled: "cancelled",
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function extractPostcode(address: string | null): string {
  if (!address) return "";
  const m = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return m ? m[1].toUpperCase() : "";
}

const LONDON = "Europe/London";
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LONDON });
}
function fmtDayMonth(date: string | null): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: LONDON });
}
function fmtFullDate(date: string | null): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: LONDON });
}

function arrivalWindowLabel(row: JobRow): string | undefined {
  const start = fmtTime(row.scheduled_start_at);
  const end = fmtTime(row.scheduled_end_at);
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return undefined;
}

function scheduledLabel(row: JobRow): string | undefined {
  const day = fmtDayMonth(row.scheduled_date);
  if (!day) return undefined;
  const window = arrivalWindowLabel(row);
  if (window) return `${day}, ${window}`;
  return day;
}

function pricingModeFromRow(row: JobRow): "fixed" | "hourly" {
  if (row.job_type === "hourly" || row.job_type === "fixed") return row.job_type;
  return "fixed";
}

function durationEstimate(row: JobRow): string {
  if (!row.scheduled_start_at || !row.scheduled_end_at) return "";
  const hours = (new Date(row.scheduled_end_at).getTime() - new Date(row.scheduled_start_at).getTime()) / 3_600_000;
  if (hours <= 0) return "";
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours.toFixed(1)} hours`;
}

function elapsedLabel(row: JobRow): string | undefined {
  if (!row.partner_timer_started_at) return undefined;
  const started = new Date(row.partner_timer_started_at).getTime();
  const end = row.partner_timer_ended_at ? new Date(row.partner_timer_ended_at).getTime() : Date.now();
  let paused = row.partner_timer_accum_paused_ms ?? 0;
  if (row.partner_timer_is_paused && row.partner_timer_pause_began_at) {
    paused += Date.now() - new Date(row.partner_timer_pause_began_at).getTime();
  }
  const ms = Math.max(0, end - started - paused);
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function mapJob(row: JobRow): MyJob {
  const status = STATUS_MAP[row.status] ?? "scheduled";
  const total = row.partner_cost ?? row.partner_agreed_value ?? 0;
  const materials = row.materials_cost ?? 0;
  const labour = Math.max(0, total - materials);
  const name = row.client_name || "Customer";
  const customer: Customer = {
    id: row.client_id || "",
    name,
    initials: initialsFrom(name),
    priorJobs: 0,
    address: row.property_address || "",
    postcode: extractPostcode(row.property_address),
  };
  const rawProgress = row.progress ?? 0;
  const progress = rawProgress > 1 ? rawProgress / 100 : rawProgress;
  const parkingNotes = row.has_free_parking
    ? "Free parking on site."
    : row.in_ccz
      ? "In a Congestion Charge Zone — check charges."
      : "";

  return {
    id: row.reference || row.id,
    uuid: row.id,
    source: (row.quote_id ? "quote" : "job") as JobSource,
    title: row.title || "Untitled job",
    desc: row.scope || "",
    trade: (row.title?.trim() || "General Maintenance") as Trade,
    customer,
    postcode: customer.postcode,
    distance: 0, // no partner-relative distance in the schema yet
    status,
    scheduled: scheduledLabel(row),
    scheduledDate: row.scheduled_date || undefined,
    scheduledStartAt: row.scheduled_start_at || undefined,
    scheduledEndAt: row.scheduled_end_at || undefined,
    scheduleStartLabel: fmtFullDate(row.scheduled_date) || undefined,
    scheduleFinishLabel: fmtFullDate(row.scheduled_finish_date) || undefined,
    scheduleArrivalLabel: arrivalWindowLabel(row),
    pricingMode: pricingModeFromRow(row),
    inCcz: row.in_ccz === true,
    hasFreeParking: row.has_free_parking === true,
    lat: typeof row.latitude === "number" ? row.latitude : undefined,
    lng: typeof row.longitude === "number" ? row.longitude : undefined,
    completed: fmtFullDate(row.completed_date) || undefined,
    completedDate: row.completed_date || undefined,
    durationEst: durationEstimate(row),
    total,
    labour,
    materials,
    vat: (row.vat ?? 0) > 0,
    progress,
    checklistDone: 0,
    checklistTotal: 0, // no checklist table yet
    beforePhotos: 0,
    afterPhotos: 0,
    notesAdded: !!(row.report_notes || row.internal_notes || row.report_submitted),
    notes: row.report_notes || undefined,
    internalNotesText: row.internal_notes || undefined,
    referencePhotos: Array.isArray(row.images) ? row.images.filter((u): u is string => typeof u === "string" && u.length > 0) : undefined,
    signed: !!(row.final_report_submitted || row.report_submitted),
    elapsed: status === "in_progress" ? elapsedLabel(row) : undefined,
    accessNotes: row.additional_notes || "",
    parkingNotes,
    rating: row.customer_review_rating ?? undefined,
    ratingComment: row.customer_review_comment ?? undefined,
  };
}
