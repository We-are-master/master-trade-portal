import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { requireStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** POST /api/billing/confirm-setup { setupIntentId } — mark billing_ready after card saved. */
export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let setupIntentId = "";
  try {
    const body = (await req.json()) as { setupIntentId?: unknown };
    setupIntentId = typeof body.setupIntentId === "string" ? body.setupIntentId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!setupIntentId) return NextResponse.json({ error: "setupIntentId required" }, { status: 400 });

  const stripe = requireStripe();
  const intent = await stripe.setupIntents.retrieve(setupIntentId);
  if (intent.metadata?.partner_id !== session.partnerId) {
    return NextResponse.json({ error: "Invalid setup intent" }, { status: 403 });
  }
  if (intent.status !== "succeeded") {
    return NextResponse.json({ error: "Card setup not completed." }, { status: 400 });
  }

  const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!pmId) return NextResponse.json({ error: "No payment method" }, { status: 400 });

  const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  if (customerId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  }

  const admin = createServiceClient();
  await admin
    .from("partners")
    .update({ billing_ready: true, stripe_customer_id: customerId ?? undefined })
    .eq("id", session.partnerId);

  return NextResponse.json({ ok: true });
}
