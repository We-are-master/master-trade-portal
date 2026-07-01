// POST /api/partner/onboarding-profile  { trades, primaryTrade, legalType, regNumber }
// Saves the funnel's qualifying answers onto the signed-in partner so the required-docs
// checklist resolves correctly (trade certs key off trades; UTR vs company doc keys off
// legal type). Session-authenticated — writes with the service client after verifying the
// caller owns the partner row.

import { NextResponse, type NextRequest } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { trades?: unknown; primaryTrade?: unknown; legalType?: unknown; regNumber?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const trades = Array.isArray(body.trades)
    ? body.trades.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
    : [];
  const primaryTrade =
    typeof body.primaryTrade === "string" && body.primaryTrade.trim() ? body.primaryTrade.trim() : trades[0] ?? "";
  const legalType =
    body.legalType === "limited_company" ? "limited_company" : body.legalType === "self_employed" ? "self_employed" : null;
  const regNumber = typeof body.regNumber === "string" ? body.regNumber.trim() : "";

  if (trades.length === 0) return NextResponse.json({ error: "Select at least one trade." }, { status: 400 });
  if (!legalType) return NextResponse.json({ error: "Choose how you trade." }, { status: 400 });

  const update: Record<string, unknown> = {
    trades,
    trade: primaryTrade,
    partner_legal_type: legalType,
    crn: legalType === "limited_company" ? regNumber || null : null,
    utr: legalType === "self_employed" ? regNumber || null : null,
  };

  const svc = createServiceClient();
  const { error } = await svc.from("partners").update(update).eq("id", session.partnerId);
  if (error) {
    console.error("[partner/onboarding-profile] update failed:", error);
    return NextResponse.json({ error: "Couldn't save your details. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
