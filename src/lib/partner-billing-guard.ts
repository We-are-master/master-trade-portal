import type { SupabaseClient } from "@supabase/supabase-js";
import { accountTypeAllowsBilling } from "@/lib/partner-work-access";

/**
 * True when the partner is on a paid (`subscription`) plan and may use the
 * platform billing endpoints. Best-effort read of `account_type` so a database
 * without migration 247 degrades to "billing disabled" (safe default) instead
 * of throwing.
 */
export async function partnerBillingAllowed(
  admin: SupabaseClient,
  partnerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("partners")
    .select("account_type")
    .eq("id", partnerId)
    .maybeSingle();
  const accountType = (data as { account_type?: string | null } | null)?.account_type ?? null;
  return accountTypeAllowsBilling(accountType);
}
