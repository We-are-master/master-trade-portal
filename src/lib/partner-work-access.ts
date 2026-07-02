import type { Partner } from "@/types";

/** Stripe subscription is live (network funnel or portal billing). */
export function partnerSubscriptionLive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * True only for partners the OS has tiered as `subscription`. This is the single
 * gate for ALL platform-payment UI (billing page, trial card, payment modal,
 * Stripe endpoints). `free` and un-tiered (`null`) partners never see any
 * payment surface — they're either ops-managed or still under review.
 */
export function partnerBillingEnabled(
  partner: Pick<Partner, "accountType">,
): boolean {
  return partner.accountType === "subscription";
}

/** Server-side variant — same rule from a raw account_type value. */
export function accountTypeAllowsBilling(accountType: string | null | undefined): boolean {
  return accountType === "subscription";
}

/**
 * Partner can use the full portal (leads, quotes, jobs).
 *
 * Onboarding partners are now LOCKED — they can browse the portal in preview
 * mode but cannot bid, quote or claim jobs until Master OS flips them to
 * `active`. Subscription-live rows unlock regardless of status so the paying
 * self-serve funnel still works without an admin touch.
 */
export function partnerWorkUnlocked(partner: Pick<Partner, "status" | "subscriptionStatus" | "billingReady">): boolean {
  if (partner.status === "inactive" || partner.status === "on_break") return false;
  if (partner.status === "active") return true;
  if (partnerSubscriptionLive(partner.subscriptionStatus)) return true;
  if (partner.billingReady) return true;
  return false;
}
