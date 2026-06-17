import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPortalRequiredDocumentChecklist,
  mergePartnerDocumentRules,
  missingFromChecklist,
} from "@/lib/partner-required-docs";
import { fetchPartnerDocuments } from "@/lib/queries/partner-documents";

export async function partnerMissingRequiredDocs(svc: SupabaseClient, partnerId: string): Promise<string[]> {
  try {
    const [{ data: prow }, docs] = await Promise.all([
      svc.from("partners").select("trades, trade, partner_legal_type, crn").eq("id", partnerId).maybeSingle(),
      fetchPartnerDocuments(svc, partnerId),
    ]);
    const p = prow as {
      trades?: string[] | null;
      trade?: string | null;
      partner_legal_type?: string | null;
      crn?: string | null;
    } | null;
    const trades = [...(p?.trades ?? []), p?.trade ?? ""].filter(Boolean);

    let rules = mergePartnerDocumentRules(null);
    try {
      const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
      const fs = (cs as { frontend_setup?: { partner_document_rules?: unknown } } | null)?.frontend_setup;
      if (fs?.partner_document_rules) rules = mergePartnerDocumentRules(fs.partner_document_rules);
    } catch {
      /* settings not readable */
    }

    const checklist = buildPortalRequiredDocumentChecklist(p, trades, rules);
    const docRows = docs.map((d) => ({
      id: d.id,
      name: d.name,
      doc_type: d.docType,
      status: d.status,
      created_at: new Date().toISOString(),
    }));
    return missingFromChecklist(docRows, checklist).map((d) => d.name);
  } catch {
    return ["your documents could not be verified — try again"];
  }
}
