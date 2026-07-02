// GET /api/partner/funnel-complete — whether get-started collected everything for OS review.

import { NextResponse } from "next/server";
import { COMPLIANCE_CONTRACT_TYPES, isPartnerFunnelComplete, type PartnerFunnelRow } from "@/lib/partner-funnel-complete";
import { getPartnerSession } from "@/lib/partner-auth";
import {
  buildPortalRequiredDocumentChecklist,
  mergePartnerDocumentRules,
  type PartnerDocLike,
  type RequiredDocDef,
} from "@/lib/partner-required-docs";
import { buildRegistrationConfig } from "@/lib/registration-config";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const svc = createServiceClient();
  const [{ data: prow }, { data: docs }, { data: sigs }] = await Promise.all([
    svc
      .from("partners")
      .select(
        "email, phone, partner_address, location, company_name, contact_name, partner_legal_type, crn, utr, vat_registered, vat_number, catalog_service_ids, coverage_mode, service_radius_miles, coverage_latitude, coverage_longitude, included_postcodes, trades, trade",
      )
      .eq("id", session.partnerId)
      .maybeSingle(),
    svc
      .from("partner_documents")
      .select("id, name, doc_type, status, created_at")
      .eq("partner_id", session.partnerId)
      .order("created_at", { ascending: false }),
    svc
      .from("partner_contract_signatures")
      .select("contract_type")
      .eq("partner_id", session.partnerId),
  ]);

  if (!prow) return NextResponse.json({ complete: false });

  let rules = mergePartnerDocumentRules(null);
  let registrationRules = buildRegistrationConfig(null).fields;
  try {
    const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
    const fs = (cs as { frontend_setup?: unknown } | null)?.frontend_setup;
    const config = buildRegistrationConfig(fs);
    rules = mergePartnerDocumentRules((fs as { partner_document_rules?: unknown } | null)?.partner_document_rules);
    registrationRules = config.fields;
  } catch {
    /* defaults */
  }

  const p = prow as PartnerFunnelRow & {
    trades?: string[] | null;
    trade?: string | null;
    partner_legal_type?: string | null;
    crn?: string | null;
  };
  const trades = [...(p.trades ?? []), p.trade ?? ""].filter(Boolean) as string[];
  const requiredDocs = buildPortalRequiredDocumentChecklist(
    { partner_legal_type: p.partner_legal_type, crn: p.crn },
    trades,
    rules,
  );
  const docRows = ((docs ?? []) as PartnerDocLike[]).map((d) => ({
    id: d.id,
    name: d.name,
    doc_type: d.doc_type,
    status: d.status,
    created_at: d.created_at,
  }));
  const signedContractTypes = [...new Set(((sigs ?? []) as { contract_type: string }[]).map((s) => s.contract_type))];

  const complete = isPartnerFunnelComplete({
    partner: p,
    docs: docRows,
    requiredDocs,
    signedContractTypes,
    registrationRules,
    documentRules: rules,
  });

  const missingContracts = COMPLIANCE_CONTRACT_TYPES.filter((t) => !signedContractTypes.includes(t));

  return NextResponse.json({ complete, missingContracts });
}
