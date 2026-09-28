// The onboarding funnel never asks for an email code: leaving the business
// step creates the account (or picks an existing one back up) and signs this
// browser in on the spot. See /api/auth/signup.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { clearPartnerReason, EMAIL_UNVERIFIED_REASON } from "@/lib/partner-onboarding-flags";

/** Sets the session cookie for `email` on this response. False when it couldn't (caller sends the code instead). */
export async function signInWithoutCode(admin: SupabaseClient, email: string, partnerId: string): Promise<boolean> {
  const { data: link, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link?.properties?.email_otp;
  if (genErr || !otp) {
    console.error("[signin-without-code] generateLink failed:", genErr);
    return false;
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error) {
    console.error("[signin-without-code] verifyOtp failed:", error);
    return false;
  }
  // The account exists now, so the OS Onboarding tab can see this partner.
  await clearPartnerReason(admin, partnerId, EMAIL_UNVERIFIED_REASON);
  return true;
}
