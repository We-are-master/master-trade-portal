// Partner work-report submission from the trade portal.
//   GET  ?jobId=...   → current start_report / final_report + submitted flags (to prefill/lock)
//   POST (multipart)  → save the START + FINAL report to the DB and upload photos
//
// Mirrors master-os /api/quotes/submit-report exactly (same jobs.* JSONB shape + job-reports
// bucket + status→final_check), but authenticated by the partner SESSION instead of a link token.
// The partner is resolved from the session and must own the job (jobs.partner_id).

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "job-reports";
const VALID_TEMPLATES = new Set(["general", "gardener", "cleaner"]);

type Svc = ReturnType<typeof createServiceClient>;

async function partnerOwnsJob(svc: Svc, jobId: string, partnerId: string): Promise<boolean> {
  const { data } = await svc.from("jobs").select("id").eq("id", jobId).eq("partner_id", partnerId).maybeSingle();
  return !!data;
}

export async function GET(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const svc = createServiceClient();
  const { data: job } = await svc
    .from("jobs")
    .select("id, partner_id, start_report, final_report, start_report_submitted, final_report_submitted")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.partner_id !== session.partnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    startReport: job.start_report ?? null,
    finalReport: job.final_report ?? null,
    submitted: !!(job.start_report_submitted && job.final_report_submitted),
  });
}

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body." }, { status: 400 });
  }

  const jobId = String(form.get("jobId") ?? "").trim();
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  const template = String(form.get("template") ?? "").trim();
  if (!VALID_TEMPLATES.has(template)) return NextResponse.json({ error: "Invalid template." }, { status: 400 });

  let startData: Record<string, unknown> = {};
  let finalData: Record<string, unknown> = {};
  try {
    startData = JSON.parse(String(form.get("startData") ?? "{}")) as Record<string, unknown>;
    finalData = JSON.parse(String(form.get("finalData") ?? "{}")) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid startData/finalData JSON." }, { status: 400 });
  }

  // Group photo slots: photos[<slot>][] -> { slotKey: File[] }
  const photoEntries: Record<string, File[]> = {};
  for (const [key, value] of form.entries()) {
    const m = key.match(/^photos\[([^\]]+)\]\[\]$/);
    if (!m || !(value instanceof File)) continue;
    (photoEntries[m[1]] ??= []).push(value);
  }

  const svc = createServiceClient();
  const { data: job } = await svc
    .from("jobs")
    .select("id, reference, status, partner_id, start_report_submitted, final_report_submitted")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.partner_id !== session.partnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (job.status === "cancelled" || job.status === "completed") {
    return NextResponse.json({ error: `This job is ${job.status} — you can't submit a report for it.` }, { status: 409 });
  }
  if (job.start_report_submitted && job.final_report_submitted) {
    return NextResponse.json({ error: "A report has already been submitted for this job." }, { status: 409 });
  }

  const startPhotos = await uploadSlotPhotos(svc, job.id, "start", photoEntries, template);
  const finalPhotos = await uploadSlotPhotos(svc, job.id, "final", photoEntries, template);

  const now = new Date().toISOString();
  const startPayload = { template, submitted_at: now, photos: startPhotos, ...startData };
  const finalPayload = { template, submitted_at: now, photos: finalPhotos, ...finalData };

  const { error: updErr } = await svc
    .from("jobs")
    .update({
      // NOTE: prod jobs has no *_report_approved_at columns (the OS submit-report writes them but
      // they don't exist in this DB) — omitted so the update doesn't 400. Office approves in the OS.
      start_report: startPayload,
      start_report_submitted: true,
      start_report_skipped: false,
      final_report: finalPayload,
      final_report_submitted: true,
      final_report_skipped: false,
      status: "final_check",
      updated_at: now,
    })
    .eq("id", job.id);
  if (updErr) {
    console.error("[jobs/report] update failed:", updErr);
    return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
  }

  void svc
    .from("audit_logs")
    .insert({
      entity_type: "job",
      entity_id: job.id,
      entity_ref: job.reference,
      action: "report_submitted",
      field_name: "start_report+final_report",
      old_value: job.status,
      new_value: "final_check",
      metadata: { source: "trade_portal", template, partner_id: session.partnerId },
    })
    .then(({ error }) => {
      if (error) console.error("audit_logs (jobs/report)", error);
    });

  return NextResponse.json({ ok: true, jobReference: job.reference });
}

/** Cleaner: returns `{ slot: [urls...] }` map; others return flat array. Matches normalizeReport. */
async function uploadSlotPhotos(
  svc: Svc,
  jobId: string,
  kind: "start" | "final",
  photoEntries: Record<string, File[]>,
  template: string,
): Promise<string[] | Record<string, string[]>> {
  if (template !== "cleaner") {
    const flatSlot = kind === "start" ? "before" : "after";
    return uploadFlat(svc, jobId, kind, photoEntries[flatSlot] ?? []);
  }
  const allowed =
    kind === "start"
      ? new Set(["equipment", "living_room", "hallways", "kitchen", "bathrooms", "bedrooms", "steam_cleaning"])
      : new Set(["living_room", "hallways", "kitchen", "bathrooms", "bedrooms", "steam_cleaning"]);
  const result: Record<string, string[]> = {};
  for (const [slot, files] of Object.entries(photoEntries)) {
    if (!allowed.has(slot)) continue;
    result[slot] = await uploadFlat(svc, jobId, `${kind}-${slot}`, files);
  }
  return result;
}

async function uploadFlat(svc: Svc, jobId: string, prefix: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const bytes = new Uint8Array(await f.arrayBuffer());
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${jobId}/${prefix}-${i}-${ts}.jpg`;
    const { error } = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: f.type || "image/jpeg", upsert: false });
    if (error) {
      console.error("[jobs/report] photo upload failed:", error);
      continue;
    }
    const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) out.push(data.publicUrl);
  }
  return out;
}
