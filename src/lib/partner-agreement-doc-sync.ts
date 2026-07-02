// After contract e-sign, mirror signed PDFs into partner_documents for OS compliance scoring.

import type { SupabaseClient } from "@supabase/supabase-js";

const CONTRACT_TO_DOC_TYPE: Record<string, string> = {
  contractor_service_agreement: "service_agreement",
  self_bill_agreement: "self_bill_agreement",
};

const DOC_NAMES: Record<string, string> = {
  service_agreement: "Service Agreement",
  self_bill_agreement: "Self Bill Agreement",
};

export async function syncSignedContractToPartnerDocument(
  svc: SupabaseClient,
  params: {
    partnerId: string;
    contractType: string;
    signaturePdfUrl: string | null;
    signedAt: string;
  },
): Promise<void> {
  const docType = CONTRACT_TO_DOC_TYPE[params.contractType];
  if (!docType || !params.signaturePdfUrl?.trim()) return;

  const { data: existing } = await svc
    .from("partner_documents")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("doc_type", docType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    partner_id: params.partnerId,
    doc_type: docType,
    name: DOC_NAMES[docType] ?? docType,
    file_name: `${docType}.pdf`,
    file_path: params.signaturePdfUrl.trim(),
    status: "pending",
    expires_at: null,
    counts_toward_compliance: true,
    notes: `contract_signed_at:${params.signedAt}`,
  };

  if (existing?.id) {
    await svc.from("partner_documents").update(row).eq("id", existing.id);
  } else {
    await svc.from("partner_documents").insert(row);
  }
}
