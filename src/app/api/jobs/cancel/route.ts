// POST /api/jobs/cancel  { jobId, preview?, reason? }
//
// O parceiro cancela um job que é dele. Com `preview`, só devolve a penalidade
// (a tela mostra antes de confirmar). O parceiro vem da sessão, nunca do corpo.
// Quem registra, tira o parceiro e oferece de novo é o Master OS.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { callMasterOsPartnerPortalCancel } from "@/lib/master-os-internal";

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { jobId?: string; preview?: boolean; reason?: string } | null;
  if (!body?.jobId || typeof body.jobId !== "string") return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const r = await callMasterOsPartnerPortalCancel(body.jobId, session.partnerId, {
    preview: body.preview === true,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status >= 500 ? 502 : r.status });
  return NextResponse.json(r);
}
