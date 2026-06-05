// POST /api/jobs/accept  { jobId }
//
// First-to-accept-wins claim of an auto-assign job offer. The partner is resolved from the
// signed-in session (never trusted from the request body). The claim + Zendesk Job booked
// email + invite finalisation run in Master OS — the same path as the email "Accept job" CTA.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { partnerMissingRequiredDocs } from "@/lib/partner-docs-gate";
import { callMasterOsPartnerPortalAccept } from "@/lib/master-os-internal";

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

    let svc;
    try {
      svc = createServiceClient();
    } catch (err) {
      console.error("[portal-accept] service client missing:", err);
      return NextResponse.json(
        {
          error: "Server configuration error",
          code: "server_misconfigured",
          message: "SERVICE_ROLE_KEY is not set on the trade portal.",
        },
        { status: 503 },
      );
    }

    const missing = await partnerMissingRequiredDocs(svc, session.partnerId);
    if (missing.length) {
      return NextResponse.json(
        { error: `Upload your required documents first: ${missing.join(", ")}.`, code: "docs_required" },
        { status: 403 },
      );
    }

    const result = await callMasterOsPartnerPortalAccept(jobId, session.partnerId);

    if (!result.ok) {
      if (result.status === 409 && result.error === "job_taken") {
        return NextResponse.json({ accepted: false, error: result.error, message: result.message });
      }
      if (result.status === 410) {
        return NextResponse.json({ accepted: false, error: result.error, message: result.message });
      }
      if (result.code === "docs_required" || result.status === 403) {
        return NextResponse.json(
          { error: result.message ?? result.error, code: "docs_required" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        {
          error: result.error,
          message: result.message ?? result.error ?? "Couldn't accept job",
          code: result.code,
        },
        { status: result.status >= 400 ? result.status : 500 },
      );
    }

    return NextResponse.json({
      accepted: true,
      jobId,
      reference: result.jobReference,
      alreadyConfirmed: result.alreadyConfirmed ?? false,
    });
  } catch (err) {
    console.error("[portal-accept] unexpected error:", err);
    return NextResponse.json(
      { error: "accept_failed", message: "Unexpected error accepting job. Try again." },
      { status: 500 },
    );
  }
}
