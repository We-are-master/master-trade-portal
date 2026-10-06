import type { Partner } from "@/types";

/**
 * Partner can use the full portal (leads, quotes, jobs).
 *
 * New self-signups arrive as `onboarding` and are LOCKED to preview mode until an
 * admin approves them in Master OS (which flips status to `active`). A legacy paid
 * subscription that is still `active` in Stripe unlocks too (paid plans were
 * retired on 6 Oct 2026; nothing creates new ones). `trialing` never unlocks.
 */
export function partnerWorkUnlocked(partner: Pick<Partner, "status" | "subscriptionStatus">): boolean {
  if (partner.status === "inactive" || partner.status === "on_break") return false;
  if (partner.status === "active") return true;
  return partner.subscriptionStatus === "active";
}
