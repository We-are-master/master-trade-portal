// GET /api/partner/registration-config — authenticated registration rules for signed-in partners.

import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { buildRegistrationConfig } from "@/lib/registration-config";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const svc = tryCreateServiceClient();
  if (!svc) {
    return NextResponse.json(buildRegistrationConfig(null));
  }

  try {
    const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
    const fs = (cs as { frontend_setup?: unknown } | null)?.frontend_setup;
    return NextResponse.json(buildRegistrationConfig(fs));
  } catch (e) {
    console.error("[partner/registration-config]", e);
    return NextResponse.json(buildRegistrationConfig(null));
  }
}
