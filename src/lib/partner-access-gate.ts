import type { SupabaseClient } from "@supabase/supabase-js";

export type PartnerAccessStatus = "active" | "onboarding" | "inactive" | "on_break" | "needs_attention" | string;

export async function getPartnerAccessStatus(
  svc: SupabaseClient,
  partnerId: string,
): Promise<PartnerAccessStatus | null> {
  const { data } = await svc.from("partners").select("status").eq("id", partnerId).maybeSingle();
  return (data as { status?: PartnerAccessStatus } | null)?.status ?? null;
}

async function getPartnerBilling(
  svc: SupabaseClient,
  partnerId: string,
): Promise<{ status: PartnerAccessStatus | null; subscription_status: string | null }> {
  const { data } = await svc
    .from("partners")
    .select("status, subscription_status")
    .eq("id", partnerId)
    .maybeSingle();
  const row = data as { status?: PartnerAccessStatus; subscription_status?: string | null } | null;
  return {
    status: row?.status ?? null,
    subscription_status: row?.subscription_status ?? null,
  };
}

/**
 * Returns an error message when the partner cannot take work actions yet.
 *
 * Mirrors partnerWorkUnlocked (client gate): only an approved (`active`) partner
 * or one on a live PAID subscription may act. `onboarding`/`trialing` stay blocked
 * until an admin approves them in Master OS.
 */
export async function partnerWorkAccessBlocked(
  svc: SupabaseClient,
  partnerId: string,
): Promise<string | null> {
  const { status, subscription_status } = await getPartnerBilling(svc, partnerId);
  if (status === "active") return null;
  if (subscription_status === "active") return null;
  return "Your account is still in review. New accounts are usually approved within 24–48h — we'll email you as soon as you're live.";
}
