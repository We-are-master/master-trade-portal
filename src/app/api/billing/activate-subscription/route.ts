// POST /api/billing/activate-subscription
// Used to start a paid partner plan once the card was on file. Plans were
// retired on 6 October 2026, so this answers 410 Gone and never creates a
// subscription. Existing subscriptions are not touched here.

import { NextResponse } from "next/server";
import { PARTNER_PLANS_RETIRED_MESSAGE } from "@/lib/plan-catalog";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "plans_retired", message: PARTNER_PLANS_RETIRED_MESSAGE }, { status: 410 });
}
