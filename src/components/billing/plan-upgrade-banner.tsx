"use client";

import type { PlanFeature } from "@/lib/plan-catalog";

/** Free/Paid plan upgrades paused — every active partner has equal access. */
export function PlanUpgradeBanner({ feature }: { feature: PlanFeature }) {
  void feature;
  return null;
}
