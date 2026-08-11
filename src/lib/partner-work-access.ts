import type { Partner } from "@/types";

/** Stripe subscription is live (network funnel or portal billing). */
export function partnerSubscriptionLive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Platform billing UI (plan card, Stripe checkout, paywall) — paused for now.
 * Free / Paid account types are not used in the portal until billing returns.
 */
export function partnerBillingEnabled(
  _partner: Pick<Partner, "accountType">,
): boolean {
  return false;
}

/** Server-side variant — billing paused (same for every account_type). */
export function accountTypeAllowsBilling(_accountType: string | null | undefined): boolean {
  return false;
}

/**
 * Partner can use the full portal (leads, quotes, jobs).
 *
 * New self-signups arrive as `onboarding` + `trialing` and are LOCKED to preview
 * mode until an admin approves them in Master OS (which flips status to `active`).
 * A live PAID subscription unlocks too — but `trialing` does NOT, so free-trial /
 * onboarding accounts always wait for the manual approval + notification flow.
 */
export function partnerWorkUnlocked(partner: Pick<Partner, "status" | "subscriptionStatus">): boolean {
  if (partner.status === "inactive" || partner.status === "on_break") return false;
  if (partner.status === "active") return true;
  return partner.subscriptionStatus === "active";
}
