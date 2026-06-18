import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { planIdForPriceId } from "@/lib/plan-catalog";
import { requireStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Admin = ReturnType<typeof createServiceClient>;

function tsToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function applySubscription(admin: Admin, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planIdForPriceId(priceId) ?? (sub.metadata?.plan as string | undefined) ?? "pro";
  const update = {
    subscription_status: sub.status,
    plan,
    stripe_customer_id: customerId,
    current_period_end: tsToIso(periodEnd),
    trial_ends_at: tsToIso(sub.trial_end),
  };
  const partnerId = sub.metadata?.partner_id;
  if (partnerId) {
    await admin.from("partners").update(update).eq("id", partnerId);
  } else {
    await admin.from("partners").update(update).eq("stripe_customer_id", customerId);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = requireStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await requireStripe().subscriptions.retrieve(subId);
          await applySubscription(admin, sub);
        }
        break;
      }
      case "setup_intent.succeeded": {
        const intent = event.data.object as Stripe.SetupIntent;
        const partnerId = intent.metadata?.partner_id;
        if (partnerId) {
          await admin.from("partners").update({ billing_ready: true }).eq("id", partnerId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(admin, event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("Stripe webhook handler error:", e);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
