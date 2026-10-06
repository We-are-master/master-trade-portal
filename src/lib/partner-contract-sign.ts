import type { SupabaseClient } from "@supabase/supabase-js";
import { hydrateContractHtml } from "@/lib/contract-branding";
import { renderPartnerSignedContractPdf } from "@/lib/partner-contract-pdf-server";
import type { VatStatus } from "@/lib/vat-status";

export const PARTNER_CONTRACTS_BUCKET = "partner-documents";

export interface ContractVersionRow {
  id: string;
  contract_type: string;
  version: string;
  title: string;
  body_html: string;
}

export interface SignPartnerContractInput {
  svc: SupabaseClient;
  partnerId: string;
  userId: string;
  signerEmail: string;
  signerName: string;
  contractVersion: ContractVersionRow;
  cleanSignatureBase64: string;
  signerIp: string;
  deviceInfo: string | null;
  companyName: string;
  signedAt?: string;
  /**
   * A declaration the partner made with this signature, printed on the signed
   * PDF and kept in the audit log (e.g. Annex 1, the VAT Status Declaration).
   */
  declaration?: { title: string; lines: string[]; vatStatus?: VatStatus };
}

export interface SignPartnerContractResult {
  signatureId: string;
  contractType: string;
  contractVersionId: string;
  signatureImageUrl: string;
  signaturePdfUrl: string | null;
  signedAt: string;
  signerIp: string;
  alreadySigned?: boolean;
}

export function decodeSignatureBase64(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^data:image\/\w+;base64,/, "");
}

export async function signPartnerContract(
  input: SignPartnerContractInput,
): Promise<SignPartnerContractResult> {
  const {
    svc,
    partnerId,
    userId,
    signerEmail,
    signerName,
    contractVersion: cv,
    cleanSignatureBase64,
    signerIp,
    deviceInfo,
    companyName,
    declaration,
  } = input;
  const signedAt = input.signedAt ?? new Date().toISOString();

  const { data: existing } = await svc
    .from("partner_contract_signatures")
    .select("id, signature_pdf_url, signature_image_url, signed_at, signer_ip")
    .eq("partner_id", partnerId)
    .eq("contract_version_id", cv.id)
    .maybeSingle();

  if (existing) {
    const row = existing as {
      id: string;
      signature_pdf_url: string | null;
      signature_image_url: string;
      signed_at: string;
      signer_ip: string | null;
    };
    return {
      signatureId: row.id,
      contractType: cv.contract_type,
      contractVersionId: cv.id,
      signatureImageUrl: row.signature_image_url,
      signaturePdfUrl: row.signature_pdf_url,
      signedAt: row.signed_at,
      signerIp: row.signer_ip ?? signerIp,
      alreadySigned: true,
    };
  }

  const signatureBuffer = Buffer.from(cleanSignatureBase64, "base64");
  const signatureId = crypto.randomUUID();
  const signatureStoragePath = `${partnerId}/signatures/${signatureId}.png`;

  const { error: uploadErr } = await svc.storage
    .from(PARTNER_CONTRACTS_BUCKET)
    .upload(signatureStoragePath, signatureBuffer, {
      contentType: "image/png",
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`Failed to upload signature: ${uploadErr.message}`);
  }

  const { data: signaturePublicUrl } = svc.storage
    .from(PARTNER_CONTRACTS_BUCKET)
    .getPublicUrl(signatureStoragePath);
  const signatureDataUrl = `data:image/png;base64,${cleanSignatureBase64}`;

  let signaturePdfUrl: string | null = null;
  try {
    const pdfBuffer = await renderPartnerSignedContractPdf({
      companyName,
      contractTitle: cv.title,
      contractVersion: cv.version,
      contractType: cv.contract_type,
      bodyHtml: hydrateContractHtml(cv.body_html),
      signerFullName: signerName,
      signerEmail,
      signedAt,
      signerIp,
      deviceInfo,
      signatureImageBase64: signatureDataUrl,
      contractVersionId: cv.id,
      declarationTitle: declaration?.title,
      declarationLines: declaration?.lines,
    });

    const pdfStoragePath = `${partnerId}/contracts/${signatureId}.pdf`;
    const { error: pdfUploadErr } = await svc.storage
      .from(PARTNER_CONTRACTS_BUCKET)
      .upload(pdfStoragePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (pdfUploadErr) {
      console.error("[partner-contract-sign] pdf upload:", pdfUploadErr);
    } else {
      const { data: pdfPublicUrl } = svc.storage
        .from(PARTNER_CONTRACTS_BUCKET)
        .getPublicUrl(pdfStoragePath);
      signaturePdfUrl = pdfPublicUrl.publicUrl;
    }
  } catch (pdfErr) {
    console.error("[partner-contract-sign] pdf generation:", pdfErr);
  }

  const { data: inserted, error: insertErr } = await svc
    .from("partner_contract_signatures")
    .insert({
      partner_id: partnerId,
      contract_version_id: cv.id,
      contract_type: cv.contract_type,
      signer_full_name: signerName,
      signer_email: signerEmail,
      signature_image_url: signaturePublicUrl.publicUrl,
      signature_pdf_url: signaturePdfUrl,
      signer_ip: signerIp,
      device_info: deviceInfo,
      signed_at: signedAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    throw new Error(insertErr.message);
  }

  const signatureRecordId = (inserted as { id: string }).id;

  void svc
    .from("audit_logs")
    .insert({
      entity_type: "partner_contract_signature",
      entity_id: signatureRecordId,
      entity_ref: `${cv.contract_type}:${cv.version}`,
      action: "signed",
      field_name: "signature_pdf_url",
      new_value: signaturePdfUrl,
      user_id: userId,
      user_name: signerName,
      metadata: {
        partner_id: partnerId,
        contract_version_id: cv.id,
        contract_type: cv.contract_type,
        contract_title: cv.title,
        signer_email: signerEmail,
        signer_ip: signerIp,
        device_info: deviceInfo,
        signed_at: signedAt,
        signature_image_url: signaturePublicUrl.publicUrl,
        ...(declaration
          ? { declaration_title: declaration.title, declaration_lines: declaration.lines, vat_status: declaration.vatStatus ?? null }
          : {}),
      },
    })
    .then(({ error }) => {
      if (error) console.error("[partner-contract-sign] audit_logs:", error.message);
    });

  return {
    signatureId: signatureRecordId,
    contractType: cv.contract_type,
    contractVersionId: cv.id,
    signatureImageUrl: signaturePublicUrl.publicUrl,
    signaturePdfUrl,
    signedAt,
    signerIp,
  };
}

export async function fetchCompanyName(svc: SupabaseClient): Promise<string> {
  const { data: brandingRow } = await svc
    .from("company_settings")
    .select("company_name")
    .limit(1)
    .maybeSingle();
  return (brandingRow as { company_name?: string } | null)?.company_name?.trim() || "Fixfy";
}
