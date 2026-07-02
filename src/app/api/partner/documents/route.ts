// Partner compliance documents.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import {
  ALLOWED_PARTNER_DOC_TYPES,
  REQUIRED_PARTNER_DOCS,
  resolvePartnerDocExpiresAt,
} from "@/lib/partner-required-docs";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePartnerPortalCredential } from "@/lib/partner-portal-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "partner-documents";
const SIGNED_TTL = 60 * 60;

type Svc = ReturnType<typeof createServiceClient>;

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "bin";
}

function insertErrorMessage(code: string | undefined, message: string): string {
  if (code === "23514") {
    return "This document type is not accepted. Contact support if this keeps happening.";
  }
  return message || "Couldn't record the document. Try again.";
}

export async function POST(req: Request) {
  const session = await getPartnerSession();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  // Fallback: if the OTP session cookie hasn't stuck yet, accept the wizard's
  // draft `code` in the form data and resolve the partner from that instead.
  let partnerId = session?.partnerId ?? "";
  if (!partnerId) {
    const draftCode = String(form.get("code") ?? "").trim();
    if (draftCode) {
      const draft = await resolvePartnerPortalCredential(draftCode);
      if (draft?.partnerId) partnerId = draft.partnerId;
    }
  }
  if (!partnerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const docType = String(form.get("docType") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const file = form.get("file");
  if (!docType) return NextResponse.json({ error: "docType is required" }, { status: 400 });
  if (!ALLOWED_PARTNER_DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "A file is required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max file size is 10 MB" }, { status: 400 });

  const svc = createServiceClient();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${partnerId}/${docType}-${ts}.${extFromName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    console.error("[partner/documents] upload failed:", upErr);
    return NextResponse.json({ error: "Couldn't upload the file. Try again." }, { status: 500 });
  }

  const defaultName = REQUIRED_PARTNER_DOCS.find((d) => d.docType === docType)?.name || "Document";
  const { data: row, error: insErr } = await svc
    .from("partner_documents")
    .insert({
      partner_id: partnerId,
      doc_type: docType,
      name: name || defaultName,
      file_name: file.name,
      file_path: path,
      status: "pending",
      expires_at: resolvePartnerDocExpiresAt(docType),
    })
    .select("id")
    .single();
  if (insErr) {
    await svc.storage.from(BUCKET).remove([path]);
    console.error("[partner/documents] insert failed:", insErr);
    return NextResponse.json(
      { error: insertErrorMessage(insErr.code, insErr.message) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: row.id });
}

async function ownedDoc(svc: Svc, id: string, partnerId: string): Promise<{ file_path: string | null } | null> {
  const { data } = await svc.from("partner_documents").select("id, file_path, partner_id").eq("id", id).maybeSingle();
  if (!data || data.partner_id !== partnerId) return null;
  return { file_path: data.file_path as string | null };
}

export async function GET(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const svc = createServiceClient();
  const doc = await ownedDoc(svc, id, session.partnerId);
  if (!doc) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!doc.file_path) return NextResponse.json({ error: "No file" }, { status: 404 });
  const { data } = await svc.storage.from(BUCKET).createSignedUrl(doc.file_path, SIGNED_TTL);
  return NextResponse.json({ url: data?.signedUrl ?? null });
}

export async function DELETE(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const svc = createServiceClient();
  const doc = await ownedDoc(svc, id, session.partnerId);
  if (!doc) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (doc.file_path) await svc.storage.from(BUCKET).remove([doc.file_path]);
  const { error } = await svc.from("partner_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
