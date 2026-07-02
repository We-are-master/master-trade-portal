// POST /api/partner/onboarding-coverage  { postcode, radiusMiles }
// Saves radius coverage with server-side geocode for OS matching.

import { NextResponse, type NextRequest } from "next/server";
import { geocodeUkPostcode } from "@/lib/geocode-uk-postcode";
import {
  isPartnerRegistrationFieldMandatory,
  isPartnerRegistrationFieldVisible,
  mergePartnerRegistrationRules,
} from "@/lib/partner-registration-fields";
import { buildRegistrationConfig } from "@/lib/registration-config";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const svc = createServiceClient();
  let registrationRules = mergePartnerRegistrationRules(null);
  try {
    const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
    registrationRules = buildRegistrationConfig(
      (cs as { frontend_setup?: unknown } | null)?.frontend_setup,
    ).fields;
  } catch {
    /* defaults */
  }

  if (!isPartnerRegistrationFieldVisible("coverage", registrationRules)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: { postcode?: unknown; radiusMiles?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const postcode = typeof body.postcode === "string" ? body.postcode.trim().toUpperCase() : "";
  const radiusMiles = typeof body.radiusMiles === "number" ? body.radiusMiles : Number(body.radiusMiles);

  if (!postcode) {
    if (!isPartnerRegistrationFieldMandatory("coverage", registrationRules)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ error: "Enter your base postcode." }, { status: 400 });
  }
  if (!Number.isFinite(radiusMiles) || radiusMiles < 1 || radiusMiles > 50) {
    if (!isPartnerRegistrationFieldMandatory("coverage", registrationRules)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ error: "Choose a radius between 1 and 50 miles." }, { status: 400 });
  }

  const coords = await geocodeUkPostcode(postcode);
  if (!coords) {
    return NextResponse.json({ error: "Couldn't find that postcode. Check and try again." }, { status: 422 });
  }

  const { error } = await svc
    .from("partners")
    .update({
      location: postcode,
      coverage_mode: "radius",
      coverage_base_postcode: postcode,
      service_radius_miles: Math.round(radiusMiles),
      coverage_latitude: coords.latitude,
      coverage_longitude: coords.longitude,
      included_postcodes: null,
      coverage_cities: null,
    })
    .eq("id", session.partnerId);

  if (error) {
    console.error("[partner/onboarding-coverage] update failed:", error);
    return NextResponse.json({ error: "Couldn't save your service area. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, latitude: coords.latitude, longitude: coords.longitude });
}
