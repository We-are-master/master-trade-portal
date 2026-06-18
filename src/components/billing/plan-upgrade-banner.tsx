"use client";

import { T } from "@/lib/tokens";
import { Button } from "@/components/ui/primitives";
import { getPlan, planAllows, type PlanFeature } from "@/lib/plan-catalog";
import { usePartner } from "@/components/partner-context";
import { startCheckout } from "@/lib/billing";

export function PlanUpgradeBanner({ feature }: { feature: PlanFeature }) {
  const partner = usePartner();
  if (planAllows(partner.plan, feature)) return null;

  const plan = getPlan(partner.plan);
  const target = feature === "leads" ? "Pro or VIP" : "Pro or VIP";

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: T.navy,
        color: T.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Upgrade to unlock {feature}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
          Your {plan.name} plan doesn&apos;t include {feature}. Move to {target} to compete for more work.
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={() => void startCheckout(feature === "jobs" ? "pro" : "vip")}
      >
        View plans
      </Button>
    </div>
  );
}
