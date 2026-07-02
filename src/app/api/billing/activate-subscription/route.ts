import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { parsePlanId, priceIdForPlan, type PlanId } from "@/lib/plan-catalog";
import { requireStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { accountTypeAllowsBilling } from "@/lib/partner-work-access";

export const runtime = "nodejs";

/** POST /api/billing/activate-subscription — start billing when account is active + card on file. */
export async function POST() {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: row } = await admin
    .from("partners")
    .select("id, status, plan, billing_ready, stripe_customer_id, subscription_status")
    .eq("id", session.partnerId)
    .maybeSingle();

  const p = row as {
    status?: string | null;
    plan?: string | null;
    billing_ready?: boolean | null;
    stripe_customer_id?: string | null;
    subscription_status?: string | null;
  } | null;

  if (!p) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  // Free / un-tiered partners have no platform billing. Best-effort select so
  // a database without migration 247 doesn't break the route — a missing
  // column reads as null → billing disabled, which is the safe default.
  const { data: acctRow } = await admin
    .from("partners")
    .select("account_type")
    .eq("id", session.partnerId)
    .maybeSingle();
  const accountType = (acctRow as { account_type?: string | null } | null)?.account_type ?? null;
  if (!accountTypeAllowsBilling(accountType)) {
    return NextResponse.json(
      { error: "billing_disabled", message: "This account is not on a paid plan." },
      { status: 403 },
    );
  }
  if (p.status !== "active" && p.status !== "onboarding") {
    return NextResponse.json({ error: "account_not_active", message: "Account cannot start billing yet." }, { status: 403 });
  }
  if (!p.billing_ready) {
    return NextResponse.json({ error: "billing_not_ready", message: "Add a payment method first." }, { status: 422 });
  }
  if (p.subscription_status === "active" || p.subscription_status === "trialing") {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }
  if (!p.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 422 });
  }

  const planId = (parsePlanId(p.plan) ?? "pro") as PlanId;
  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    return NextResponse.json({ error: `Price not configured for plan ${planId}` }, { status: 503 });
  }

  const stripe = requireStripe();
  const customer = await stripe.customers.retrieve(p.stripe_customer_id);
  if (customer.deleted) {
    return NextResponse.json({ error: "Stripe customer missing" }, { status: 422 });
  }

  const defaultPm =
    typeof customer.invoice_settings?.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;

  const sub = await stripe.subscriptions.create({
    customer: p.stripe_customer_id,
    items: [{ price: priceId }],
    default_payment_method: defaultPm ?? undefined,
    metadata: { partner_id: session.partnerId, plan: planId },
  });

  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? null;
  await admin
    .from("partners")
    .update({
      subscription_status: sub.status,
      plan: planId,
      status: "active",
      billing_ready: true,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("id", session.partnerId);

  return NextResponse.json({ ok: true, status: sub.status });
}
