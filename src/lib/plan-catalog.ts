export type PlanId = "starter" | "pro" | "vip";
export type PlanFeature = "leads" | "jobs" | "quotes";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  priceLabel: string;
  pricePence: number;
  interval: "month" | "year";
  stripePriceEnvKey: string;
  features: string[];
  limits: Partial<Record<PlanFeature, number | null>>;
  highlighted?: boolean;
  badge?: string;
};

const STARTER: PlanDefinition = {
  id: "starter",
  name: "Starter",
  tagline: "Get in touch with unlimited leads",
  priceLabel: "£69/mo",
  pricePence: 6900,
  interval: "month",
  stripePriceEnvKey: "STRIPE_PRICE_STARTER_MONTHLY",
  features: [
    "Unlimited hot leads — contact customers directly",
    "Profile & document management",
    "Weekly payout schedule",
  ],
  limits: { leads: null, jobs: 0, quotes: 0 },
};

const PRO: PlanDefinition = {
  id: "pro",
  name: "Pro",
  tagline: "Grow with jobs and quotes",
  priceLabel: "£99/mo",
  pricePence: 9900,
  interval: "month",
  stripePriceEnvKey: "STRIPE_PRICE_PRO_MONTHLY",
  features: [
    "30 leads per month",
    "15 job accepts per month",
    "10 quote bids per month",
    "Full schedule & operations",
  ],
  limits: { leads: 30, jobs: 15, quotes: 10 },
};

const VIP: PlanDefinition = {
  id: "vip",
  name: "VIP Annual",
  tagline: "Everything unlimited — best value",
  priceLabel: "£499/yr",
  pricePence: 49900,
  interval: "year",
  stripePriceEnvKey: "STRIPE_PRICE_VIP_ANNUAL",
  features: [
    "Unlimited leads, jobs & quotes",
    "Dedicated account manager",
    "Priority access to VIP customers",
    "Fast-track approvals",
  ],
  limits: { leads: null, jobs: null, quotes: null },
  highlighted: true,
  badge: "Best value",
};

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  starter: STARTER,
  pro: PRO,
  vip: VIP,
};

export const PLAN_ORDER: PlanId[] = ["starter", "pro", "vip"];

export const DEFAULT_PLAN_ID: PlanId = "pro";

export const PARTNERS_LP_URL = "https://www.getfixfy.com/partners";

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "starter" || value === "pro" || value === "vip";
}

export function parsePlanId(value: string | null | undefined): PlanId | null {
  const v = value?.trim().toLowerCase();
  return isPlanId(v) ? v : null;
}

export function getPlan(planId: string | null | undefined): PlanDefinition {
  const id = parsePlanId(planId) ?? DEFAULT_PLAN_ID;
  return PLAN_CATALOG[id];
}

export function planAllows(planId: string | null | undefined, feature: PlanFeature): boolean {
  const limit = getPlan(planId).limits[feature];
  if (limit === 0) return false;
  return true;
}

/** `null` = unlimited for that feature on the plan. */
export function planLimit(planId: string | null | undefined, feature: PlanFeature): number | null {
  const limit = getPlan(planId).limits[feature];
  if (limit === 0) return 0;
  return limit ?? null;
}

export function annualSavingsCopy(): string {
  const proYear = PRO.pricePence * 12;
  const saved = proYear - VIP.pricePence;
  const pounds = Math.round(saved / 100);
  return `Save £${pounds}/year vs Pro monthly`;
}

export function priceIdForPlan(planId: PlanId): string | null {
  const envKey = PLAN_CATALOG[planId].stripePriceEnvKey;
  const id = process.env[envKey]?.trim();
  if (id) return id;
  if (planId === "pro") return process.env.STRIPE_PRICE_FIXFY_PRO?.trim() || null;
  return null;
}

export function planIdForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    if (priceIdForPlan(id) === priceId) return id;
  }
  // Legacy single-plan env
  const legacy = process.env.STRIPE_PRICE_FIXFY_PRO?.trim();
  if (legacy && legacy === priceId) return "pro";
  return null;
}
