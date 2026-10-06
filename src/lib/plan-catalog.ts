// Paid partner plans (Starter, Pro, VIP) were retired on 6 October 2026, when
// Fixfy moved to the disclosed-agent marketplace model: joining and using the
// platform is free, and Fixfy's only charges to a partner are its commission
// on Platform Bookings and the late-withdrawal fee (Partner Agreement, clause 8).
//
// Nothing in the portal sells a plan any more. What is left here only lets the
// Stripe webhook recognise subscriptions that already exist, so their status
// keeps syncing until they are wound down from Stripe. No subscription is
// cancelled by this code.

export type PlanId = "starter" | "pro" | "vip";

const PLAN_IDS: PlanId[] = ["starter", "pro", "vip"];

/** Env keys of the Stripe prices the old plans used (legacy subscriptions only). */
const LEGACY_PRICE_ENV_KEYS: Record<PlanId, string> = {
  starter: "STRIPE_PRICE_STARTER_MONTHLY",
  pro: "STRIPE_PRICE_PRO_MONTHLY",
  vip: "STRIPE_PRICE_VIP_ANNUAL",
};

export const PARTNERS_LP_URL = "https://www.getfixfy.com/partners";

/** What the retired billing endpoints answer (HTTP 410). */
export const PARTNER_PLANS_RETIRED_MESSAGE =
  "Fixfy no longer offers paid partner plans. Joining and using the platform is free.";

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "starter" || value === "pro" || value === "vip";
}

export function parsePlanId(value: string | null | undefined): PlanId | null {
  const v = value?.trim().toLowerCase();
  return isPlanId(v) ? v : null;
}

/** Stripe price id a legacy plan was sold at, if it is still configured. */
export function priceIdForPlan(planId: PlanId): string | null {
  const id = process.env[LEGACY_PRICE_ENV_KEYS[planId]]?.trim();
  if (id) return id;
  if (planId === "pro") return process.env.STRIPE_PRICE_FIXFY_PRO?.trim() || null;
  return null;
}

/** Which legacy plan a Stripe price belongs to (webhook sync of old subscriptions). */
export function planIdForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_IDS) {
    if (priceIdForPlan(id) === priceId) return id;
  }
  // Oldest single-plan env.
  const legacy = process.env.STRIPE_PRICE_FIXFY_PRO?.trim();
  if (legacy && legacy === priceId) return "pro";
  return null;
}
