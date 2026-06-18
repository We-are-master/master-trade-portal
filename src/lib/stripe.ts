// Stripe server client. Mirrors the master-os pattern.
// SERVER ONLY — never import into a client component.

import Stripe from "stripe";
import { type PlanId, priceIdForPlan, planIdForPriceId } from "@/lib/plan-catalog";

let instance: Stripe | null = null;

function getStripe(): Stripe | null {
  if (instance) return instance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  instance = new Stripe(key, { typescript: true });
  return instance;
}

export const stripe = getStripe();

export function requireStripe(): Stripe {
  const client = getStripe();
  if (!client) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  return client;
}

/** @deprecated Use priceIdForPlan('pro') — kept for legacy env. */
export const FIXFY_PRO_PRICE_ID = process.env.STRIPE_PRICE_FIXFY_PRO ?? process.env.STRIPE_PRICE_PRO_MONTHLY;

export { priceIdForPlan, planIdForPriceId };
export type { PlanId };
