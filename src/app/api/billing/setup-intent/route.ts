// POST /api/billing/setup-intent
// Used to save a partner's card for a paid plan. Plans were retired on
// 6 October 2026, so no card is collected any more: this answers 410 Gone.

import { NextResponse } from "next/server";
import { PARTNER_PLANS_RETIRED_MESSAGE } from "@/lib/plan-catalog";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "plans_retired", message: PARTNER_PLANS_RETIRED_MESSAGE }, { status: 410 });
}
