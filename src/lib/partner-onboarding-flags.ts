// Reason codes on partners.partner_status_reasons that keep a portal signup out of
// the OS Onboarding tab (same codes in master-os src/lib/partner-status.ts).
//   email_unverified        — set when the partner row is born; cleared when the funnel creates
//                             the account (/api/auth/signup signs new partners in without a
//                             code) or by /api/auth/verify-otp.
//   onboarding_not_started  — set when the partner row is born; cleared on the first
//                             rate card save or the first document upload.
// Both are cleared together when the partner finishes the details step (Continue with name,
// company, email and phone): from there the office sees them in Onboarding, even if they stop.
// The row the autosave creates while they're still typing stays hidden.
import type { SupabaseClient } from "@supabase/supabase-js";

export const EMAIL_UNVERIFIED_REASON = "email_unverified";
export const ONBOARDING_NOT_STARTED_REASON = "onboarding_not_started";
export const NEW_PORTAL_PARTNER_REASONS = [EMAIL_UNVERIFIED_REASON, ONBOARDING_NOT_STARTED_REASON];

/** Drops reason code(s) from a partner, if present. Never throws: a failed clear only delays visibility. */
export async function clearPartnerReason(
  svc: SupabaseClient,
  partnerId: string,
  reason: string | readonly string[],
): Promise<void> {
  const drop = typeof reason === "string" ? [reason] : reason;
  try {
    const { data } = await svc.from("partners").select("partner_status_reasons").eq("id", partnerId).maybeSingle();
    const reasons = ((data as { partner_status_reasons?: string[] | null } | null)?.partner_status_reasons ?? []) as string[];
    if (!reasons.some((r) => drop.includes(r))) return;
    const { error } = await svc
      .from("partners")
      .update({ partner_status_reasons: reasons.filter((r) => !drop.includes(r)) })
      .eq("id", partnerId);
    if (error) console.error(`[partner-onboarding-flags] clear ${reason} failed:`, error);
  } catch (e) {
    console.error(`[partner-onboarding-flags] clear ${reason} failed:`, e);
  }
}
