import { createServiceClient } from "@/lib/supabase/service";
import {
  getPlan,
  planAllows,
  planLimit,
  type PlanFeature,
  type PlanId,
} from "@/lib/plan-catalog";

type UsageRow = {
  plan?: string | null;
  subscription_status?: string | null;
  status?: string | null;
  usage_period_start?: string | null;
  leads_used?: number | null;
  jobs_used?: number | null;
  quotes_used?: number | null;
};

function currentPeriodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function loadUsageRow(partnerId: string): Promise<UsageRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("partners")
    .select("plan, subscription_status, status, usage_period_start, leads_used, jobs_used, quotes_used")
    .eq("id", partnerId)
    .maybeSingle();
  return (data as UsageRow | null) ?? null;
}

async function ensureUsagePeriod(partnerId: string, row: UsageRow): Promise<UsageRow> {
  const period = currentPeriodStart();
  if (row.usage_period_start === period) return row;
  const admin = createServiceClient();
  const reset = { usage_period_start: period, leads_used: 0, jobs_used: 0, quotes_used: 0 };
  await admin.from("partners").update(reset).eq("id", partnerId);
  return { ...row, ...reset };
}

function usageCount(row: UsageRow, feature: PlanFeature): number {
  if (feature === "leads") return row.leads_used ?? 0;
  if (feature === "jobs") return row.jobs_used ?? 0;
  return row.quotes_used ?? 0;
}

/** Returns user-facing block message, or null if allowed. */
export async function partnerFeatureBlocked(
  partnerId: string,
  feature: PlanFeature,
): Promise<string | null> {
  const row = await loadUsageRow(partnerId);
  if (!row) return "Partner not found.";
  if (row.status !== "active") return null; // account gate handles non-active

  const planId = (row.plan ?? "pro") as PlanId;
  if (!planAllows(planId, feature)) {
    if (feature === "jobs") return "Upgrade to Pro or VIP to accept jobs.";
    if (feature === "quotes") return "Upgrade to Pro or VIP to bid on quotes.";
    return "This feature isn't on your plan.";
  }

  const limit = planLimit(planId, feature);
  if (limit === null) return null;

  const fresh = await ensureUsagePeriod(partnerId, row);
  const used = usageCount(fresh, feature);
  if (used >= limit) {
    const plan = getPlan(planId);
    if (planId === "pro") return `You've reached your ${limit} ${feature} limit this month. Upgrade to VIP for unlimited access.`;
    return `You've reached your ${plan.name} limit for ${feature} this month.`;
  }
  return null;
}

export async function incrementPlanUsage(partnerId: string, feature: PlanFeature): Promise<void> {
  const row = await loadUsageRow(partnerId);
  if (!row) return;
  const fresh = await ensureUsagePeriod(partnerId, row);
  const planId = (fresh.plan ?? "pro") as PlanId;
  const limit = planLimit(planId, feature);
  if (limit === null) return;

  const admin = createServiceClient();
  const col = feature === "leads" ? "leads_used" : feature === "jobs" ? "jobs_used" : "quotes_used";
  const next = usageCount(fresh, feature) + 1;
  await admin.from("partners").update({ [col]: next }).eq("id", partnerId);
}
