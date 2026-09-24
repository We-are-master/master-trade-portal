// Reason codes on partners.partner_status_reasons that keep a portal signup out of
// the OS Onboarding tab (same codes in master-os src/lib/partner-status.ts).
//   email_unverified        — set when the partner row is born; cleared by /api/auth/verify-otp.
//   onboarding_not_started  — set when the partner row is born; cleared on the first
//                             rate card save or the first document upload.
// The office only sees partners who confirmed their email AND actually started.
import type { SupabaseClient } from "@supabase/supabase-js";

export const EMAIL_UNVERIFIED_REASON = "email_unverified";
export const ONBOARDING_NOT_STARTED_REASON = "onboarding_not_started";
export const NEW_PORTAL_PARTNER_REASONS = [EMAIL_UNVERIFIED_REASON, ONBOARDING_NOT_STARTED_REASON];

/** Drops one reason code from a partner, if present. Never throws: a failed clear only delays visibility. */
export async function clearPartnerReason(svc: SupabaseClient, partnerId: string, reason: string): Promise<void> {
  try {
    const { data } = await svc.from("partners").select("partner_status_reasons").eq("id", partnerId).maybeSingle();
    const reasons = ((data as { partner_status_reasons?: string[] | null } | null)?.partner_status_reasons ?? []) as string[];
    if (!reasons.includes(reason)) return;
    const { error } = await svc
      .from("partners")
      .update({ partner_status_reasons: reasons.filter((r) => r !== reason) })
      .eq("id", partnerId);
    if (error) console.error(`[partner-onboarding-flags] clear ${reason} failed:`, error);
  } catch (e) {
    console.error(`[partner-onboarding-flags] clear ${reason} failed:`, e);
  }
}
