// POST /api/contracts/sign-all — one signature applied to all active partner contracts.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/client-ip";
import { PARTNER_CONTRACT_TYPES } from "@/lib/partner-contract-types";
import { syncSignedContractToPartnerDocument } from "@/lib/partner-agreement-doc-sync";
import {
  decodeSignatureBase64,
  fetchCompanyName,
  signPartnerContract,
  type ContractVersionRow,
} from "@/lib/partner-contract-sign";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SignAllBody = {
  signatureDataUrl?: string;
  signatureImageBase64?: string;
  signerName?: string;
  deviceInfo?: string;
};

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: SignAllBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const cleanBase64 = decodeSignatureBase64(body.signatureImageBase64 || body.signatureDataUrl);
  const signerName = body.signerName?.trim();
  if (!cleanBase64 || !signerName) {
    return NextResponse.json(
      { error: "signature image and signerName are required" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const signerIp = getClientIp(req);
  const deviceInfo = body.deviceInfo?.trim() || req.headers.get("user-agent") || null;
  const signedAt = new Date().toISOString();
  const companyName = await fetchCompanyName(svc);

  const { data: versions, error: versionErr } = await svc
    .from("contract_versions")
    .select("id, contract_type, version, title, body_html")
    .eq("is_active", true)
    .in("contract_type", [...PARTNER_CONTRACT_TYPES]);
  if (versionErr) {
    return NextResponse.json({ error: versionErr.message }, { status: 500 });
  }

  const activeVersions = (versions as ContractVersionRow[]) ?? [];
  if (activeVersions.length === 0) {
    return NextResponse.json({ error: "No active partner contracts published" }, { status: 404 });
  }

  const results: Array<{
    contractType: string;
    contractVersionId: string;
    signatureId: string;
    signaturePdfUrl: string | null;
    signedAt: string;
    alreadySigned?: boolean;
  }> = [];

  for (const cv of activeVersions) {
    try {
      const result = await signPartnerContract({
        svc,
        partnerId: session.partnerId,
        userId: session.userId,
        signerEmail: session.email ?? "",
        signerName,
        contractVersion: cv,
        cleanSignatureBase64: cleanBase64,
        signerIp,
        deviceInfo,
        companyName,
        signedAt,
      });
      await syncSignedContractToPartnerDocument(svc, {
        partnerId: session.partnerId,
        contractType: result.contractType,
        signaturePdfUrl: result.signaturePdfUrl,
        signedAt: result.signedAt,
      });
      results.push({
        contractType: result.contractType,
        contractVersionId: result.contractVersionId,
        signatureId: result.signatureId,
        signaturePdfUrl: result.signaturePdfUrl,
        signedAt: result.signedAt,
        alreadySigned: result.alreadySigned,
      });
    } catch (err) {
      console.error(`[contracts/sign-all] ${cv.contract_type}:`, err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to sign contracts",
          partial: results,
        },
        { status: 500 },
      );
    }
  }

  const allAlready = results.every((r) => r.alreadySigned);
  const newlySigned = results.filter((r) => !r.alreadySigned);

  return NextResponse.json({
    signed: true,
    already: allAlready,
    contracts: results,
    newlySignedCount: newlySigned.length,
    signedAt,
    signerIp,
  });
}
