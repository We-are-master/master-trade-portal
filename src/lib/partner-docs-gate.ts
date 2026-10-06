import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPortalRequiredDocumentChecklist,
  mergePartnerDocumentRules,
  missingFromChecklist,
} from "@/lib/partner-required-docs";
import { fetchPartnerDocuments } from "@/lib/queries/partner-documents";

/**
 * ENFORCE_PLATFORM_DOCS (server env, default OFF).
 *
 * Agent model (6 Oct 2026): Photo ID, public liability (min £1m) and the trade
 * registration are required before a partner can receive PLATFORM BOOKINGS
 * (website / consumer jobs), not before business-client work (Housekeep,
 * Fantastic, accounts), which must keep running for active partners.
 *
 * master-os does not yet say per job whether an offer is a Platform Booking, so
 * this stays off: the accept gate then checks the OS document rules exactly as
 * before. Switch it on ("1" or "true") only once the OS field ships and
 * jobIsPlatformBooking() reads it. Switched on before that, every accept is
 * treated as a Platform Booking. New sign-ups are asked for the three documents
 * in /get-started (no Skip) either way.
 */
export function platformDocsEnforced(): boolean {
  const v = process.env.ENFORCE_PLATFORM_DOCS?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Whether a job is a Platform Booking (Schedule A) rather than Fixfy Client
 * Work (Schedule B). Null = unknown.
 *
 * TODO(master-os): jobs has no such field yet. When the OS adds it, read it
 * here.
 */
export async function jobIsPlatformBooking(_svc: SupabaseClient, _jobId: string): Promise<boolean | null> {
  return null;
}

export async function partnerMissingRequiredDocs(
  svc: SupabaseClient,
  partnerId: string,
  /** True to apply the Platform Booking documents on top of the OS rules. */
  opts: { platformBooking?: boolean } = {},
): Promise<string[]> {
  const platformBooking = opts.platformBooking === true;
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

    let rules = mergePartnerDocumentRules(null, { forcePlatformBookingDocs: platformBooking });
    try {
      const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
      const fs = (cs as { frontend_setup?: { partner_document_rules?: unknown } } | null)?.frontend_setup;
      if (fs?.partner_document_rules) {
        rules = mergePartnerDocumentRules(fs.partner_document_rules, { forcePlatformBookingDocs: platformBooking });
      }
    } catch {
      /* settings not readable */
    }

    const checklist = buildPortalRequiredDocumentChecklist(p, trades, rules, { platformBooking });
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
