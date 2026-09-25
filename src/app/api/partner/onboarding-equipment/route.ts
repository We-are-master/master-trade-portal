// POST /api/partner/onboarding-equipment  { hasOwnTools, canSupplyMaterials }
// "Tools & materials" step of /get-started, right after the service area.
// Both are essential to work with Fixfy; the funnel only lets them through
// with two yeses, and the answers stay on the partner for the OS review.

import { NextResponse, type NextRequest } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { hasOwnTools?: unknown; canSupplyMaterials?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.hasOwnTools !== "boolean" || typeof body.canSupplyMaterials !== "boolean") {
    return NextResponse.json({ error: "Answer both questions." }, { status: 400 });
  }

  const { error } = await createServiceClient()
    .from("partners")
    .update({ has_own_tools: body.hasOwnTools, can_supply_materials: body.canSupplyMaterials })
    .eq("id", session.partnerId);
  if (error) {
    console.error("[partner/onboarding-equipment]", error);
    return NextResponse.json({ error: "Couldn't save your answers." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
