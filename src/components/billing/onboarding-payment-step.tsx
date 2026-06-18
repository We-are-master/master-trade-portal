"use client";

import { useCallback, useState } from "react";
import { T } from "@/lib/tokens";
import { usePartner } from "@/components/partner-context";
import { useRegisterOnboardingSave } from "@/components/onboarding-save";
import { getPlan } from "@/lib/plan-catalog";
import { PlanSummaryCard } from "@/components/billing/plan-summary-card";
import { PaymentMethodSetup } from "@/components/billing/payment-method-setup";

export function OnboardingPaymentStep() {
  const partner = usePartner();
  const plan = getPlan(partner.plan);
  const [ready, setReady] = useState(partner.billingReady);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async () => {
    if (ready || partner.billingReady) return true;
    setError("Add your card to continue — you won't be charged until Fixfy approves your account.");
    return false;
  }, [ready, partner.billingReady]);

  useRegisterOnboardingSave(validate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      <PlanSummaryCard planId={partner.plan} />
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: T.amber50,
          border: `1px solid ${T.amber}`,
          fontSize: 13,
          lineHeight: 1.5,
          color: T.ink,
        }}
      >
        <strong>No charge today.</strong> Your {plan.priceLabel} plan only starts after Fixfy approves your documents and
        account.
      </div>
      {ready || partner.billingReady ? (
        <div style={{ padding: 16, borderRadius: 10, background: T.green50, border: `1px solid ${T.green}`, fontSize: 14, color: T.ink }}>
          Card saved securely. You&apos;re all set — continue to verification.
        </div>
      ) : (
        <PaymentMethodSetup
          onSuccess={() => setReady(true)}
          onError={(msg) => setError(msg)}
        />
      )}
      {error && <p style={{ fontSize: 13, color: T.coral, margin: 0 }}>{error}</p>}
    </div>
  );
}
