// /api/jobs/photos — before/after job photos for the signed-in partner.
//   GET    ?jobId=...        → list this job's photos with short-lived signed URLs
//   POST   (multipart)       → upload { jobId, kind, file } to the private bucket + record it
//   DELETE ?id=...           → remove a photo (storage object + row)
//
// The partner is resolved from the session and must own the job (jobs.partner_id). The service
// role does storage I/O (bucket is private), so files are only ever reached via signed URLs.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "job-photos";
const SIGNED_TTL = 60 * 60; // 1h
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

async function partnerOwnsJob(svc: ReturnType<typeof createServiceClient>, jobId: string, partnerId: string): Promise<boolean> {
  const { data } = await svc.from("jobs").select("id").eq("id", jobId).eq("partner_id", partnerId).maybeSingle();
  return !!data;
}

async function sign(svc: ReturnType<typeof createServiceClient>, path: string): Promise<string | null> {
  const { data } = await svc.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

export async function GET(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const svc = createServiceClient();
  if (!(await partnerOwnsJob(svc, jobId, session.partnerId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc.from("job_photos").select("id,kind,path,created_at").eq("job_id", jobId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const photos = await Promise.all(
    (data ?? []).map(async (r) => ({ id: r.id as string, kind: r.kind as "before" | "after", url: await sign(svc, r.path as string) })),
  );
  return NextResponse.json({ photos });
}

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const jobId = form?.get("jobId");
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof jobId !== "string" || (kind !== "before" && kind !== "after") || !(file instanceof File)) {
    return NextResponse.json({ error: "jobId, kind (before|after) and file required" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });

  const svc = createServiceClient();
  if (!(await partnerOwnsJob(svc, jobId, session.partnerId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ext = EXT[file.type] ?? "jpg";
  const path = `${jobId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await svc
    .from("job_photos")
    .insert({ job_id: jobId, partner_id: session.partnerId, kind, path })
    .select("id")
    .single();
  if (error) {
    await svc.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id, kind, url: await sign(svc, path) });
}

export async function DELETE(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const svc = createServiceClient();
  const { data: row } = await svc.from("job_photos").select("id,path,partner_id").eq("id", id).maybeSingle();
  if (!row || row.partner_id !== session.partnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await svc.storage.from(BUCKET).remove([row.path as string]);
  const { error } = await svc.from("job_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
