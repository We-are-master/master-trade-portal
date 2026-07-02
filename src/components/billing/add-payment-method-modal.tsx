"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { Modal, Icon } from "@/components/ui/primitives";
import { getPlan } from "@/lib/plan-catalog";
import { PaymentMethodSetup } from "@/components/billing/payment-method-setup";
import { usePartner } from "@/components/partner-context";

export function AddPaymentMethodModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose?: () => void;
  onSaved: () => void;
}) {
  const partner = usePartner();
  const plan = getPlan(partner.plan);
  const [error, setError] = useState<string | null>(null);

  const handleSaved = async () => {
    onSaved();
    if (partner.status === "active") {
      await fetch("/api/billing/activate-subscription", { method: "POST" }).catch(() => {});
    }
  };

  if (!open) return null;

  return (
    <Modal onClose={onClose ?? (() => {})} width={440}>
      <div className="fx-secure-plan-modal">
        <div className="fx-secure-plan-hero">
          {onClose && (
            <button type="button" className="fx-secure-plan-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={18} color="rgba(255,255,255,0.85)" />
            </button>
          )}
          <div className="fx-secure-plan-hero-icon">
            <Icon name="shield-check" size={22} color={T.coral} />
          </div>
          <h2 className="fx-secure-plan-heading">Secure your plan</h2>
          <p className="fx-secure-plan-sub">
            Save your card now — access unlocks when Fixfy approves your account in the OS.
          </p>
        </div>

        <div className="fx-secure-plan-body">
          <div className="fx-secure-plan-card">
            <div className="fx-secure-plan-card-label">Your plan</div>
            <div className="fx-secure-plan-card-row">
              <span className="fx-secure-plan-card-name">{plan.name}</span>
              <span className="fx-secure-plan-card-price">{plan.priceLabel}</span>
            </div>
            <p className="fx-secure-plan-card-note">
              No charge until approval. Billing starts only when your account goes live.
            </p>
          </div>

          <div className="fx-secure-plan-steps">
            <Step done label="Profile" />
            <Step done label="Documents" />
            <Step active label="Card" />
            <Step label="OS approval" />
          </div>

          <div className="fx-secure-plan-form">
            <PaymentMethodSetup
              onSuccess={() => void handleSaved()}
              onError={(msg) => setError(msg)}
            />
          </div>

          {error && (
            <div className="fx-secure-plan-error" role="alert">
              <Icon name="alert-triangle" size={14} color={T.coral} />
              <span>{error}</span>
            </div>
          )}

          <p className="fx-secure-plan-footnote">
            <Icon name="lock" size={12} color={T.mute} />
            Processed by Stripe · Fixfy never stores card details
          </p>

          <button type="button" className="fx-secure-plan-dismiss" onClick={onClose}>
            Browse portal — work unlocks after OS approval
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Step({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`fx-secure-plan-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}>
      <span className="fx-secure-plan-step-dot">
        {done ? <Icon name="check" size={10} color={T.white} /> : active ? "•" : ""}
      </span>
      <span className="fx-secure-plan-step-label">{label}</span>
    </div>
  );
}
