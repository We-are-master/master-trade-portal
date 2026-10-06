// POST /api/billing/checkout
// Used to open a Stripe Checkout for a paid partner plan. Plans were retired on
// 6 October 2026 (Fixfy charges no fees to join or use the platform), so this
// answers 410 Gone and never creates a checkout or a subscription.

import { NextResponse } from "next/server";
import { PARTNER_PLANS_RETIRED_MESSAGE } from "@/lib/plan-catalog";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "plans_retired", message: PARTNER_PLANS_RETIRED_MESSAGE }, { status: 410 });
}
