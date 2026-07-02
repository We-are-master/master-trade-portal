// POST /api/partner/onboarding-profile
// Saves funnel profile fields onto the signed-in partner row.

import { NextResponse, type NextRequest } from "next/server";
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

function isVatProfileComplete(
  legalType: "limited_company" | "self_employed",
  vatRegistered: boolean | null,
  vatNumber: string,
): boolean {
  if (legalType !== "limited_company") return true;
  if (vatRegistered === false) return true;
  if (vatRegistered === true) return !!vatNumber.trim();
  return !!vatNumber.trim();
}

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: {
    trades?: unknown;
    primaryTrade?: unknown;
    catalogServiceIds?: unknown;
    legalType?: unknown;
    regNumber?: unknown;
    phone?: unknown;
    partnerAddress?: unknown;
    vatRegistered?: unknown;
    vatNumber?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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

  const trades = Array.isArray(body.trades)
    ? body.trades.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
    : [];
  const catalogServiceIds = Array.isArray(body.catalogServiceIds)
    ? body.catalogServiceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const primaryTrade =
    typeof body.primaryTrade === "string" && body.primaryTrade.trim() ? body.primaryTrade.trim() : trades[0] ?? "";
  const legalType =
    body.legalType === "limited_company" ? "limited_company" : body.legalType === "self_employed" ? "self_employed" : null;
  const regNumber = typeof body.regNumber === "string" ? body.regNumber.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const partnerAddress = typeof body.partnerAddress === "string" ? body.partnerAddress.trim() : "";
  const vatNumber = typeof body.vatNumber === "string" ? body.vatNumber.trim() : "";
  const vatRegistered =
    body.vatRegistered === true ? true : body.vatRegistered === false ? false : null;

  if (isPartnerRegistrationFieldMandatory("trades", registrationRules) && trades.length === 0) {
    return NextResponse.json({ error: "Select at least one trade." }, { status: 400 });
  }
  if (isPartnerRegistrationFieldVisible("legal_type", registrationRules) && isPartnerRegistrationFieldMandatory("legal_type", registrationRules) && !legalType) {
    return NextResponse.json({ error: "Choose how you trade." }, { status: 400 });
  }
  if (isPartnerRegistrationFieldVisible("tax_id", registrationRules) && isPartnerRegistrationFieldMandatory("tax_id", registrationRules)) {
    if (!legalType) return NextResponse.json({ error: "Choose how you trade." }, { status: 400 });
    if (!regNumber) {
      return NextResponse.json(
        { error: legalType === "limited_company" ? "Enter your company number." : "Enter your UTR." },
        { status: 400 },
      );
    }
  }
  if (isPartnerRegistrationFieldVisible("phone", registrationRules) && isPartnerRegistrationFieldMandatory("phone", registrationRules) && !phone) {
    return NextResponse.json({ error: "Enter your phone number." }, { status: 400 });
  }
  if (isPartnerRegistrationFieldVisible("address", registrationRules) && isPartnerRegistrationFieldMandatory("address", registrationRules) && !partnerAddress) {
    return NextResponse.json({ error: "Enter your business address." }, { status: 400 });
  }
  if (
    isPartnerRegistrationFieldVisible("vat", registrationRules) &&
    legalType === "limited_company" &&
    vatRegistered === true &&
    !vatNumber
  ) {
    return NextResponse.json({ error: "Enter your VAT number or mark as not VAT registered." }, { status: 400 });
  }
  if (
    isPartnerRegistrationFieldVisible("vat", registrationRules) &&
    isPartnerRegistrationFieldMandatory("vat", registrationRules) &&
    legalType &&
    !isVatProfileComplete(legalType, vatRegistered, vatNumber)
  ) {
    return NextResponse.json({ error: "Complete your VAT details." }, { status: 400 });
  }

  const orderedTrades = primaryTrade
    ? [primaryTrade, ...trades.filter((t) => t !== primaryTrade)]
    : trades;

  const update: Record<string, unknown> = {};
  if (trades.length) {
    update.trades = orderedTrades;
    update.trade = primaryTrade;
    // NOT NULL constraint on catalog_service_ids in some environments — an
    // empty array is the correct "none selected" value, never null.
    update.catalog_service_ids = catalogServiceIds;
  }
  if (legalType) {
    update.partner_legal_type = legalType;
    update.crn = legalType === "limited_company" ? regNumber || null : null;
    update.utr = legalType === "self_employed" ? regNumber || null : null;
  }
  if (phone || isPartnerRegistrationFieldVisible("phone", registrationRules)) {
    update.phone = phone || null;
  }
  if (partnerAddress || isPartnerRegistrationFieldVisible("address", registrationRules)) {
    update.partner_address = partnerAddress || null;
  }
  if (legalType === "limited_company" && isPartnerRegistrationFieldVisible("vat", registrationRules)) {
    update.vat_registered = vatRegistered;
    update.vat_number = vatNumber || null;
  }

  const { error } = await svc.from("partners").update(update).eq("id", session.partnerId);
  if (error) {
    console.error("[partner/onboarding-profile] update failed:", error);
    return NextResponse.json({ error: "Couldn't save your details. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
