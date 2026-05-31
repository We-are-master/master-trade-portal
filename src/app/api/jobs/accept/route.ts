// POST /api/jobs/accept  { jobId }
//
// First-to-accept-wins claim of an auto-assign job offer. The partner is resolved from the
// signed-in session (never trusted from the request body), then a service-role client performs
// an ATOMIC conditional update: it only succeeds while the row is still status='auto_assigning'
// with partner_id IS NULL and this partner is in auto_assign_invited_partner_ids. Postgres row
// locking serialises concurrent accepts, so a second partner matches 0 rows → { accepted:false }.
//
// After a successful claim, notifies Master OS to finalise invites + send Job booked Zendesk email.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { partnerMissingRequiredDocs } from "@/lib/partner-docs-gate";
import { notifyMasterOsPartnerPortalAccept } from "@/lib/master-os-internal";

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const svc = createServiceClient();

  const missing = await partnerMissingRequiredDocs(svc, session.partnerId);
  if (missing.length) {
    return NextResponse.json(
      { error: `Upload your required documents first: ${missing.join(", ")}.`, code: "docs_required" },
      { status: 403 },
    );
  }

  const partnerName =
    session.partner.tradingName?.trim() ||
    `${session.partner.firstName} ${session.partner.lastName}`.trim() ||
    null;
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("jobs")
    .update({
      partner_id: session.partnerId,
      partner_name: partnerName,
      status: "scheduled",
      partner_confirmed_at: now,
      auto_assign_expires_at: null,
    })
    .eq("id", jobId)
    .eq("status", "auto_assigning")
    .is("partner_id", null)
    .contains("auto_assign_invited_partner_ids", [session.partnerId])
    .select("id, reference");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ accepted: false });
  }

  void notifyMasterOsPartnerPortalAccept(data[0].id, session.partnerId).catch((err) =>
    console.error("[portal-accept] OS notify failed:", err),
  );

  return NextResponse.json({ accepted: true, jobId: data[0].id, reference: data[0].reference });
}
