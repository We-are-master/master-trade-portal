// Journal da reclamação no portal (15/10/2026). Mesma tabela que o OS lê
// (job_complaint_messages, mig 330 do OS).
//   GET  ?jobId=<uuid>                     → reclamação + mensagens que o parceiro pode ver
//   POST multipart { jobId, body, photos[] } → mensagem do parceiro

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "job-photos";
const MAX_FOTOS = 10;

type Svc = NonNullable<ReturnType<typeof tryCreateServiceClient>>;

async function jobDoParceiro(svc: Svc, jobId: string, partnerId: string) {
  const { data } = await svc
    .from("jobs")
    .select("id, partner_id, status, on_hold_at, on_hold_reason, on_hold_complaint_description, on_hold_submission_at")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  return data && data.partner_id === partnerId ? data : null;
}

export async function GET(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const svc = tryCreateServiceClient();
  if (!svc) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  const job = await jobDoParceiro(svc, jobId, session.partnerId);
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await svc
    .from("job_complaint_messages")
    .select("id, author, author_name, body, photos, visible_to_partner, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const linhas = ((data ?? []) as Array<{ id: string; author: string; author_name: string | null; body: string | null; photos: string[] | null; visible_to_partner: boolean; created_at: string }>).filter(
    (l) => l.author === "partner" || l.visible_to_partner,
  );
  const caminhos = linhas.flatMap((l) => l.photos ?? []);
  const assinadas = new Map<string, string>();
  if (caminhos.length) {
    const { data: urls } = await svc.storage.from(BUCKET).createSignedUrls(caminhos, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) assinadas.set(u.path, u.signedUrl);
  }
  const texto = (job.on_hold_complaint_description ?? job.on_hold_reason ?? "").replace(/^complaint\s*[—:-]\s*/i, "").trim();
  return NextResponse.json({
    complaint: texto ? { text: texto, at: job.on_hold_at } : null,
    messages: linhas.map((l) => ({
      id: l.id,
      author: l.author,
      authorName: l.author_name,
      body: l.body,
      photos: (l.photos ?? []).map((p) => assinadas.get(p)).filter(Boolean),
      at: l.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const jobId = String(form.get("jobId") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 4000);
  const arquivos = form.getAll("photos[]").filter((v): v is File => v instanceof File && v.size > 0).slice(0, MAX_FOTOS);
  if (!body && arquivos.length === 0) return NextResponse.json({ error: "Write a message or add a photo." }, { status: 400 });

  const svc = tryCreateServiceClient();
  if (!svc) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  const job = await jobDoParceiro(svc, jobId, session.partnerId);
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const caminhos: string[] = [];
  for (const [i, f] of arquivos.entries()) {
    const ext = f.type === "application/pdf" ? "pdf" : f.type.includes("png") ? "png" : "jpg";
    const caminho = `complaints/${jobId}/partner-${Date.now()}-${i}.${ext}`;
    const { error } = await svc.storage.from(BUCKET).upload(caminho, new Uint8Array(await f.arrayBuffer()), { contentType: f.type || "image/jpeg" });
    if (!error) caminhos.push(caminho);
  }
  const { data: p } = await svc.from("partners").select("company_name, contact_name").eq("id", session.partnerId).maybeSingle();
  const nome = (p as { company_name?: string | null; contact_name?: string | null } | null)?.company_name || (p as { contact_name?: string | null } | null)?.contact_name || "Partner";
  const { error } = await svc.from("job_complaint_messages").insert({
    job_id: jobId,
    author: "partner",
    author_name: nome,
    body: body || null,
    photos: caminhos,
    visible_to_partner: true,
  });
  if (error) return NextResponse.json({ error: "Could not send. Try again." }, { status: 500 });

  /**
   * A resposta no journal vale como "parceiro respondeu" (15/10/2026): o OS e o Today do
   * portal leem on_hold_submission_at. Só a primeira resposta da pausa marca; as fotos
   * ficam no journal (bucket job-photos), o resumo aqui leva o texto.
   */
  const j = job as { status?: string | null; on_hold_submission_at?: string | null };
  if (j.status === "on_hold" && !j.on_hold_submission_at) {
    const agora = new Date().toISOString();
    await svc
      .from("jobs")
      .update({
        on_hold_submission: { notes: body || "(photos in the complaint journal)", partner_id: session.partnerId, submitted_at: agora, via: "journal" },
        on_hold_submission_at: agora,
        updated_at: agora,
      })
      .eq("id", jobId);
  }
  return NextResponse.json({ ok: true });
}
