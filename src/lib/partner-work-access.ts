import type { Partner } from "@/types";

/** Stripe subscription is live (network funnel or portal billing). */
export function partnerSubscriptionLive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** Partner can use the full portal — no manual OS review gate; payment is the activation path. */
export function partnerWorkUnlocked(partner: Pick<Partner, "status" | "subscriptionStatus" | "billingReady">): boolean {
  if (partner.status === "inactive" || partner.status === "on_break") return false;
  if (partner.status === "onboarding" || partner.status === "active") return true;
  if (partnerSubscriptionLive(partner.subscriptionStatus)) return true;
  if (partner.billingReady) return true;
  return false;
}
