// POST /api/contracts/sign  { contractVersionId, contractType, signatureDataUrl, signerName }
//
// Records a partner's e-signature of a contract version (partner_contract_signatures). The
// partner is resolved from the session; the signature image is stored inline as a PNG data URL
// (small, self-contained). Captures IP + user-agent for UK e-signature audit. Idempotent per
// (partner, version) via the table's unique constraint.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { contractVersionId?: string; contractType?: string; signatureDataUrl?: string; signerName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { contractVersionId, contractType, signatureDataUrl, signerName } = body;
  if (!contractVersionId || !contractType || !signatureDataUrl || !signerName?.trim()) {
    return NextResponse.json({ error: "contractVersionId, contractType, signatureDataUrl and signerName are required" }, { status: 400 });
  }
  if (!signatureDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid signature image" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Already signed this version? treat as success.
  const { data: existing } = await svc
    .from("partner_contract_signatures")
    .select("id")
    .eq("partner_id", session.partnerId)
    .eq("contract_version_id", contractVersionId)
    .maybeSingle();
  if (existing) return NextResponse.json({ signed: true, already: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  const { error } = await svc.from("partner_contract_signatures").insert({
    partner_id: session.partnerId,
    contract_version_id: contractVersionId,
    contract_type: contractType,
    signer_full_name: signerName.trim(),
    signer_email: session.email ?? "",
    signature_image_url: signatureDataUrl,
    signer_ip: ip,
    device_info: ua,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signed: true });
}
