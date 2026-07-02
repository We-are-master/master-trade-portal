import type { SupabaseClient } from "@supabase/supabase-js";
import { partnerSubscriptionLive } from "@/lib/partner-work-access";

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

/** Returns an error message when the partner cannot take work actions yet. */
export async function partnerWorkAccessBlocked(
  svc: SupabaseClient,
  partnerId: string,
): Promise<string | null> {
  const { status, subscription_status } = await getPartnerBilling(svc, partnerId);
  if (!status || status === "active") return null;
  if (partnerSubscriptionLive(subscription_status)) return null;
  if (status === "onboarding" || status === "active") return null;
  return "Your account isn't active yet. Contact support if you need help.";
}
