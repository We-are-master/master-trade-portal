"use client";

import { T } from "@/lib/tokens";
import { Modal, Icon } from "@/components/ui/primitives";
import { getPlan } from "@/lib/plan-catalog";
import { PaymentMethodSetup } from "@/components/billing/payment-method-setup";
import { usePartner } from "@/components/partner-context";

export function AddPaymentMethodModal({
  open,
  blocking = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  blocking?: boolean;
  onClose?: () => void;
  onSaved: () => void;
}) {
  const partner = usePartner();
  const plan = getPlan(partner.plan);

  const handleSaved = async () => {
    onSaved();
    if (partner.status === "active") {
      await fetch("/api/billing/activate-subscription", { method: "POST" }).catch(() => {});
    }
  };

  if (!open) return null;

  return (
    <Modal onClose={blocking ? () => {} : (onClose ?? (() => {}))} title="Secure your plan" width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: T.paper2,
            border: `1px solid ${T.line}`,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: T.coral, textTransform: "uppercase", letterSpacing: 1 }}>
            {plan.name} · {plan.priceLabel}
          </div>
          <p style={{ fontSize: 14, color: T.slate, lineHeight: 1.55, margin: "8px 0 0" }}>
            Add your card to run your plan. <strong>You won&apos;t be charged until Fixfy approves your account</strong> and
            your subscription starts.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: T.mute }}>
          <Icon name="shield-check" size={14} color={T.mute} />
          Payments are processed securely by Stripe. Fixfy never stores your card details.
        </div>
        <PaymentMethodSetup
          onSuccess={() => void handleSaved()}
          onError={() => {}}
        />
      </div>
    </Modal>
  );
}
