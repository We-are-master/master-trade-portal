// Link do formulário de report do OS para a aba Report (15/10/2026: "uma porta só").
//   GET ?jobId=<uuid>  → { url, osOrigin, submitted, cancelled }
//
// O portal mostra DENTRO da gaveta o mesmo formulário do OS que o e-mail abre:
// foto subindo na hora, rascunho no celular, a checagem do cliente antes de enviar e
// a mesma gravação. Usa o link curto POR JOB (short_links `job:<id>:report`); o OS
// assina no clique para o parceiro atual. `?embed=1` faz o OS servir o formulário em
// vez de mandar de volta para o portal.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const slugNovo = () => Array.from({ length: 8 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");

export async function GET(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const svc = tryCreateServiceClient();
  if (!svc) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: job } = await svc
    .from("jobs")
    .select("id, partner_id, status, start_report_submitted, final_report_submitted")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job || job.partner_id !== session.partnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const base =
    process.env.MASTER_OS_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.OS_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://app.getfixfy.com";
  const entityRef = `job:${jobId}:report`;

  const { data: existente } = await svc
    .from("short_links")
    .select("slug")
    .eq("entity_ref", entityRef)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let slug = (existente as { slug?: string } | null)?.slug ?? null;
  for (let i = 0; !slug && i < 5; i++) {
    const s = slugNovo();
    // O alvo é refeito pelo OS no clique; este só serve se a assinatura falhar lá.
    const { error } = await svc
      .from("short_links")
      .insert({ slug: s, target_path: "/job/report?token=invalid", kind: "partner_report", entity_ref: entityRef });
    if (!error) slug = s;
  }
  if (!slug) return NextResponse.json({ error: "Could not prepare the report form." }, { status: 500 });

  return NextResponse.json({
    url: `${base}/r/${slug}?embed=1`,
    osOrigin: new URL(base).origin,
    submitted: !!(job.start_report_submitted && job.final_report_submitted),
    cancelled: job.status === "cancelled",
  });
}
