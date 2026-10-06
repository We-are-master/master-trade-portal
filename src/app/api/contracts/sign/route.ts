// POST /api/contracts/sign — sign a single partner contract version.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/client-ip";
import {
  decodeSignatureBase64,
  fetchCompanyName,
  signPartnerContract,
} from "@/lib/partner-contract-sign";
import { INVOICING_CONTRACT_TYPE } from "@/lib/partner-contract-types";
import { parseVatStatus, vatStatusDeclarationLines, VAT_DECLARATION_TITLE } from "@/lib/vat-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SignBody = {
  contractVersionId?: string;
  contractType?: string;
  signatureDataUrl?: string;
  signatureImageBase64?: string;
  signerName?: string;
  deviceInfo?: string;
  /** Required for the Invoicing and Payment Collection Agreement (its Annex 1). */
  vatStatus?: unknown;
};

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: SignBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { contractVersionId, contractType, signerName } = body;
  const cleanBase64 = decodeSignatureBase64(body.signatureImageBase64 || body.signatureDataUrl);
  if (!contractVersionId || !contractType || !cleanBase64 || !signerName?.trim()) {
    return NextResponse.json(
      { error: "contractVersionId, contractType, signature image and signerName are required" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  const { data: version, error: versionErr } = await svc
    .from("contract_versions")
    .select("id, contract_type, version, title, body_html")
    .eq("id", contractVersionId)
    .eq("is_active", true)
    .maybeSingle();
  if (versionErr || !version) {
    return NextResponse.json({ error: "Contract version not found or inactive" }, { status: 404 });
  }

  const cv = version as {
    id: string;
    contract_type: string;
    version: string;
    title: string;
    body_html: string;
  };
  if (cv.contract_type !== contractType) {
    return NextResponse.json({ error: "Contract type mismatch" }, { status: 400 });
  }

  const vatStatus = cv.contract_type === INVOICING_CONTRACT_TYPE ? parseVatStatus(body.vatStatus) : null;
  if (cv.contract_type === INVOICING_CONTRACT_TYPE && !vatStatus) {
    return NextResponse.json(
      { error: "Confirm your VAT status before signing this agreement.", code: "vat_status_required" },
      { status: 400 },
    );
  }
  if (vatStatus) {
    const { error: vatErr } = await svc
      .from("partners")
      .update({ vat_registered: vatStatus.registered, vat_number: vatStatus.number })
      .eq("id", session.partnerId);
    if (vatErr) console.error("[contracts/sign] vat status update failed:", vatErr.message);
  }

  const signerIp = getClientIp(req);
  const deviceInfo = body.deviceInfo?.trim() || req.headers.get("user-agent") || null;
  const companyName = await fetchCompanyName(svc);

  try {
    const result = await signPartnerContract({
      svc,
      partnerId: session.partnerId,
      userId: session.userId,
      signerEmail: session.email ?? "",
      signerName: signerName.trim(),
      contractVersion: cv,
      cleanSignatureBase64: cleanBase64,
      signerIp,
      deviceInfo,
      companyName,
      declaration: vatStatus
        ? { title: VAT_DECLARATION_TITLE, lines: vatStatusDeclarationLines(vatStatus), vatStatus }
        : undefined,
    });

    return NextResponse.json({
      signed: true,
      already: result.alreadySigned ?? false,
      signatureId: result.signatureId,
      signaturePdfUrl: result.signaturePdfUrl,
      signedAt: result.signedAt,
      signerIp: result.signerIp,
      audit: {
        signerFullName: signerName.trim(),
        signerEmail: session.email,
        signedAt: result.signedAt,
        signerIp: result.signerIp,
        deviceInfo,
        contractVersionId,
        contractType,
      },
    });
  } catch (err) {
    console.error("[contracts/sign]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign contract" },
      { status: 500 },
    );
  }
}
