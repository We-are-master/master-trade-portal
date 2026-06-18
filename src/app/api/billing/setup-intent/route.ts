import { NextResponse, type NextRequest } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { requireStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function ensureStripeCustomer(partnerId: string, email: string | null, name: string): Promise<string> {
  const admin = createServiceClient();
  const { data } = await admin.from("partners").select("stripe_customer_id").eq("id", partnerId).maybeSingle();
  let customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  const stripe = requireStripe();
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      name,
      metadata: { partner_id: partnerId },
    });
    customerId = customer.id;
    await admin.from("partners").update({ stripe_customer_id: customerId }).eq("id", partnerId);
  }
  return customerId;
}

/** POST /api/billing/setup-intent — save card without charging. */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stripe = requireStripe();
  const customerId = await ensureStripeCustomer(
    session.partnerId,
    session.email,
    session.partner.tradingName,
  );

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    metadata: { partner_id: session.partnerId },
  });

  if (!setupIntent.client_secret) {
    return NextResponse.json({ error: "Couldn't start card setup." }, { status: 500 });
  }

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null,
  });
}
