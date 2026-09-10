// GET /api/jobs/declined → { jobIds: string[] }
//
// Job ids this partner declined (or lost) — the vitrine filters them out. Read through
// the service client because job_partner_invites is staff-only under RLS; the partner is
// resolved from the session, so each partner only ever sees their own decline list.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const session = await getPartnerSession();
    if (!session) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("job_partner_invites")
      .select("job_id, status")
      .eq("partner_id", session.partnerId)
      .in("status", ["declined", "lost"]);
    if (error) throw error;
    const jobIds = [...new Set(((data ?? []) as { job_id: string }[]).map((r) => r.job_id))];
    return NextResponse.json({ jobIds });
  } catch (err) {
    console.error("[jobs/declined] failed:", err);
    return NextResponse.json({ jobIds: [] });
  }
}
