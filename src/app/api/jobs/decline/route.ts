// POST /api/jobs/decline  { jobId }
//
// Partner passes on an auto-assign offer. The partner is resolved from the signed-in
// session (never trusted from the body). Master OS records the decline (invite row +
// removal from the invite queue) so the job leaves this partner's vitrine for good and
// the offer sweep never re-invites them.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { callMasterOsPartnerPortalDecline } from "@/lib/master-os-internal";

export async function POST(req: Request) {
  try {
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

    const result = await callMasterOsPartnerPortalDecline(jobId, session.partnerId);
    if (!result.ok) {
      return NextResponse.json(
        { declined: false, error: result.error, message: result.message },
        { status: result.status >= 500 ? 502 : result.status },
      );
    }
    return NextResponse.json({ declined: true, jobReference: result.jobReference });
  } catch (err) {
    console.error("[portal-decline] unexpected:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
