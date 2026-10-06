// POST /api/leads/respond  { leadId, status: "contacted" }
//
// Records that the signed-in partner contacted a published lead by inserting a lead_partner_offers
// row (lead_id, partner_id, offered_by). The table has no status column — the row's PRESENCE means
// "this partner reached out", which feeds the MAX_CONTACTS first-come cap. "declined" isn't stored
// (no column for it); the portal just hides a declined lead client-side. Service role after
// resolving the partner from the session.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { partnerMissingRequiredDocs } from "@/lib/partner-docs-gate";
import { partnerWorkAccessBlocked } from "@/lib/partner-access-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { leadId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { leadId, status } = body;
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // Decline isn't persisted (no column on lead_partner_offers) — the portal hides it locally.
  if (status === "declined") return NextResponse.json({ ok: true });

  const svc = createServiceClient();

  // Gate: can't contact a lead until required documents are on file.
  const missing = await partnerMissingRequiredDocs(svc, session.partnerId);
  if (missing.length) {
    return NextResponse.json(
      { error: `Upload your required documents first: ${missing.join(", ")}.`, code: "docs_required" },
      { status: 403 },
    );
  }

  const workBlocked = await partnerWorkAccessBlocked(svc, session.partnerId);
  if (workBlocked) {
    return NextResponse.json({ error: workBlocked, code: "account_not_active" }, { status: 403 });
  }

  // Idempotent on the (lead_id, partner_id) unique constraint
  // concurrent "Contact" clicks can't 500 on a race. offered_by is FK → public.profiles(id)
  // (staff); a partner self-contacting isn't a profile, so leave it null.
  let upsertPayload: Record<string, unknown> = {
    lead_id: leadId,
    partner_id: session.partnerId,
    pipeline_status: "contacted",
  };
  let { error } = await svc
    .from("lead_partner_offers")
    .upsert(upsertPayload, { onConflict: "lead_id,partner_id", ignoreDuplicates: true });

  if (error && /pipeline_status/.test(error.message)) {
    ({ error } = await svc
      .from("lead_partner_offers")
      .upsert({ lead_id: leadId, partner_id: session.partnerId }, { onConflict: "lead_id,partner_id", ignoreDuplicates: true }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reveal the customer's contact details now that this partner has reached out.
  const { data: lead } = await svc
    .from("leads")
    .select("email,phone,address,city")
    .eq("id", leadId)
    .maybeSingle();
  const contact = lead
    ? { email: lead.email ?? null, phone: lead.phone ?? null, address: [lead.address, lead.city].filter(Boolean).join(", ") || null }
    : { email: null, phone: null, address: null };

  return NextResponse.json({ ok: true, contact });
}
