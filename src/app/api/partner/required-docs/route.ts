// GET /api/partner/required-docs
// Dynamic mandatory-document checklist, each item with the file already on
// record (`uploaded`) so a partner who skipped the step sees what's still
// missing. Prefers the session, but also
// accepts a draft `?code=<shortCode>` fallback so the wizard's documents step
// still loads a proper checklist during dev races where the auth cookie
// hasn't stuck yet.

import { NextResponse, type NextRequest } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import {
  buildPortalRequiredDocumentChecklist,
  mergePartnerDocumentRules,
  pickRequiredDocMatch,
  type PartnerDocLike,
  type RequiredDocDef,
} from "@/lib/partner-required-docs";
import { tryCreateServiceClient } from "@/lib/supabase/service";
import { resolvePartnerPortalCredential } from "@/lib/partner-portal-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type RequiredDocResponse = Pick<RequiredDocDef, "id" | "docType" | "name" | "description" | "group" | "aliases"> & {
  mandatory: boolean;
  uploaded: { docId: string; fileName: string } | null;
};

export async function GET(req: NextRequest) {
  let partnerId: string | null = null;

  const session = await getPartnerSession();
  if (session?.partnerId) partnerId = session.partnerId;

  if (!partnerId) {
    const code = req.nextUrl.searchParams.get("code")?.trim();
    if (code) {
      const draft = await resolvePartnerPortalCredential(code);
      if (draft?.partnerId) partnerId = draft.partnerId;
    }
  }

  if (!partnerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const svc = tryCreateServiceClient();
  if (!svc) {
    const { REQUIRED_PARTNER_DOCS } = await import("@/lib/partner-required-docs");
    return NextResponse.json({
      required: REQUIRED_PARTNER_DOCS.map(({ id, docType, name, description, group, aliases }) => ({
        id,
        docType,
        name,
        description,
        group,
        aliases,
      })),
    });
  }

  const [{ data: prow }, { data: docRows }] = await Promise.all([
    svc.from("partners").select("trades, trade, partner_legal_type, crn").eq("id", partnerId).maybeSingle(),
    svc
      .from("partner_documents")
      .select("id, name, doc_type, status, created_at, file_name")
      .eq("partner_id", partnerId),
  ]);
  const onFile = (docRows ?? []) as (PartnerDocLike & { file_name?: string | null })[];
  const p = prow as {
    trades?: string[] | null;
    trade?: string | null;
    partner_legal_type?: string | null;
    crn?: string | null;
  } | null;
  const trades = [...(p?.trades ?? []), p?.trade ?? ""].filter(Boolean);

  // The checklist the partner sees always asks for the Platform Booking documents
  // (ID, public liability, trade registration); /get-started won't let them skip.
  let rules = mergePartnerDocumentRules(null, { forcePlatformBookingDocs: true });
  try {
    const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
    const fs = (cs as { frontend_setup?: { partner_document_rules?: unknown } } | null)?.frontend_setup;
    if (fs?.partner_document_rules) {
      rules = mergePartnerDocumentRules(fs.partner_document_rules, { forcePlatformBookingDocs: true });
    }
  } catch {
    /* settings not readable — use defaults */
  }

  const checklist = buildPortalRequiredDocumentChecklist(p, trades, rules, { platformBooking: true });
  const required: RequiredDocResponse[] = checklist.map(({ id, docType, name, description, group, aliases }) => {
    const row = rules.find((r) => r.id === id);
    const match = pickRequiredDocMatch(onFile, { docType, name, aliases }) as (typeof onFile)[number] | null;
    return {
      id,
      docType,
      name,
      description,
      group,
      aliases,
      mandatory: row ? row.mandatory && row.enabled : true,
      uploaded: match ? { docId: match.id, fileName: match.file_name || match.name } : null,
    };
  });

  return NextResponse.json({ required });
}
