// GET /api/leads — published OS leads (public.leads) broadcast to partners.
//
// Model (per product decision): a lead becomes visible to partners once staff PUBLISHES it
// (leads.published_at set). It's a broadcast — every partner sees a published lead — filtered
// only by the partner's excluded postcodes (leads carry no trade, so there's no trade match).
// lead_partner_offers just records which partners contacted a lead; the first MAX_CONTACTS to
// reach out "win" and the lead then closes for everyone else. Runs with the service role (it
// reads across partners to count contacts) after resolving the partner from the session.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { serviceMatchesAnyTrade } from "@/lib/trade-match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const MAX_CONTACTS = 5;

// terminal lead states that should never surface even if still flagged published
const CLOSED_STATUSES = "(won,lost,closed,cancelled,archived,rejected)";

function outward(pc?: string | null): string {
  if (!pc) return "";
  const s = pc.toUpperCase().replace(/\s+/g, "");
  return s.length > 3 ? s.slice(0, s.length - 3) : s;
}

interface LeadRow {
  id: string;
  reference: string | null;
  name: string | null;
  scope: string | null;
  urgency: string | null;
  status: string | null;
  postcode: string | null;
  city: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  published_at: string | null;
  created_at: string | null;
  /** mig 204 — links to service_catalog.id (nullable; legacy leads broadcast to everyone). */
  catalog_service_id: string | null;
  /** PostgREST embed of the linked catalog row (name only). Used for the
   *  trade-name fallback match when the partner has no `catalog_service_ids`. */
  catalog_service: { name: string | null } | null;
}

export async function GET() {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const partner = session.partner;
  const svc = createServiceClient();

  const { data: rows, error } = await svc
    .from("leads")
    .select(
      "id,reference,name,scope,urgency,status,postcode,city,address,email,phone,published_at,created_at,catalog_service_id," +
        "catalog_service:service_catalog!leads_catalog_service_id_fkey(name)",
    )
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .not("status", "in", CLOSED_STATUSES)
    .order("published_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull this partner's catalog_service_ids array — it's the primary key for
  // the lead trade match. Best-effort: if the column hasn't been backfilled or
  // the partner is on legacy data, we fall back to fuzzy-matching the catalog
  // name against partner.trades.
  const { data: prow } = await svc
    .from("partners")
    .select("catalog_service_ids")
    .eq("id", partner.id)
    .maybeSingle();
  const partnerCatalogIds = new Set(
    ((prow as { catalog_service_ids: string[] | null } | null)?.catalog_service_ids ?? []).filter(Boolean),
  );

  const excluded = (partner.excludedPostcodes ?? [])
    .map((e) => String(e).toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  const matched = (rows as unknown as LeadRow[]).filter((l) => {
    // Postcode exclusion (unchanged).
    const ow = outward(l.postcode);
    if (ow && excluded.some((e) => ow.startsWith(e))) return false;

    // Trade match — only enforced when the lead carries a catalog service.
    // Legacy leads (NULL) keep broadcasting to every partner so in-flight work
    // from before mig 204 isn't suddenly invisible.
    if (l.catalog_service_id) {
      if (partnerCatalogIds.has(l.catalog_service_id)) return true;
      const catalogName = l.catalog_service?.name?.trim();
      if (catalogName && serviceMatchesAnyTrade(catalogName, partner.trades as string[])) return true;
      return false;
    }
    return true;
  });
  if (matched.length === 0) return NextResponse.json({ leads: [] });

  // Count contacts per lead and whether I already contacted (presence of an offer row = contacted).
  const ids = matched.map((l) => l.id);
  const { data: offers } = await svc
    .from("lead_partner_offers")
    .select("lead_id,partner_id")
    .in("lead_id", ids);

  const contacted = new Map<string, number>();
  const mineContacted = new Set<string>();
  for (const o of offers ?? []) {
    const lid = o.lead_id as string;
    contacted.set(lid, (contacted.get(lid) ?? 0) + 1);
    if (o.partner_id === partner.id) mineContacted.add(lid);
  }

  const leads = matched
    .filter((l) => {
      const cc = contacted.get(l.id) ?? 0;
      return cc < MAX_CONTACTS || mineContacted.has(l.id); // closed once full, unless I'm in
    })
    .map((l) => {
      const iContacted = mineContacted.has(l.id);
      return {
        offerId: l.id, // the lead id — used by the respond endpoint
        reference: l.reference,
        status: iContacted ? "contacted" : "offered",
        title: l.name || l.scope || "Customer lead",
        desc: l.scope || "",
        postcode: l.postcode || "",
        budget: null as number | null, // leads carry no budget
        priority: l.urgency,
        requestKind: null as string | null,
        posted: l.published_at || l.created_at,
        contactedCount: contacted.get(l.id) ?? 0,
        maxContacts: MAX_CONTACTS,
        // Customer contact details are revealed only after this partner contacts the lead.
        email: iContacted ? l.email : null,
        phone: iContacted ? l.phone : null,
        address: iContacted ? [l.address, l.city].filter(Boolean).join(", ") || null : null,
      };
    });

  return NextResponse.json({ leads });
}
