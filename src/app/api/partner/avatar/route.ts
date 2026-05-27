// POST /api/partner/avatar (multipart { file }) — upload the partner's profile photo to the public
// `avatars` bucket and save the public URL to partners.avatar_url. Session-authed, partner-scoped.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "avatars";

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "A file is required" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Photo must be an image" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Max photo size is 5 MB" }, { status: 400 });

  const svc = createServiceClient();
  const ext = (file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || "jpg";
  const path = `${session.partnerId}/avatar-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    console.error("[partner/avatar] upload failed:", upErr);
    return NextResponse.json({ error: "Couldn't upload the photo. Try again." }, { status: 500 });
  }

  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl ?? null;

  const { error: updErr } = await svc.from("partners").update({ avatar_url: url }).eq("id", session.partnerId);
  if (updErr) {
    console.error("[partner/avatar] partners update failed:", updErr);
    return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url });
}
