// POST /api/billing/checkout
// Creates a Stripe Checkout Session for the signed-in partner's selected plan.

import { NextResponse, type NextRequest } from "next/server";
import { parsePlanId, priceIdForPlan, type PlanId } from "@/lib/plan-catalog";
import { requireStripe } from "@/lib/stripe";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { partnerBillingAllowed } from "@/lib/partner-billing-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await partnerBillingAllowed(createServiceClient(), session.partnerId))) {
    return NextResponse.json(
      { error: "billing_disabled", message: "This account is not on a paid plan." },
      { status: 403 },
    );
  }

  let bodyPlan: PlanId | null = null;
  try {
    const body = (await req.json()) as { plan?: unknown };
    bodyPlan = parsePlanId(typeof body.plan === "string" ? body.plan : null);
  } catch {
    /* optional body */
  }

  const admin = createServiceClient();
  const { data } = await admin
    .from("partners")
    .select("stripe_customer_id, trial_ends_at, plan")
    .eq("id", session.partnerId)
    .maybeSingle();

  const planId = bodyPlan ?? parsePlanId((data as { plan?: string | null } | null)?.plan) ?? "pro";
  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    return NextResponse.json({ error: `STRIPE price not set for plan ${planId}` }, { status: 503 });
  }

  const stripe = requireStripe();
  let customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;

  const trialEndsAt = (data as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
  const remainingTrialDays = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.email ?? undefined,
      name: session.partner.tradingName,
      metadata: { partner_id: session.partnerId },
    });
    customerId = customer.id;
    await admin.from("partners").update({ stripe_customer_id: customerId, plan: planId }).eq("id", session.partnerId);
  } else if (bodyPlan) {
    await admin.from("partners").update({ plan: planId }).eq("id", session.partnerId);
  }

  const origin = req.nextUrl.origin;
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      ...(remainingTrialDays >= 1 ? { trial_period_days: remainingTrialDays } : {}),
      metadata: { partner_id: session.partnerId, plan: planId },
    },
    allow_promotion_codes: true,
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancel`,
    metadata: { partner_id: session.partnerId, plan: planId },
  });

  return NextResponse.json({ url: checkout.url });
}
