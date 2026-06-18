"use client";

import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { T } from "@/lib/tokens";
import { Button } from "@/components/ui/primitives";

function SetupForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) {
        onError(error.message || "Couldn't save your card.");
        return;
      }
      if (!setupIntent?.id) {
        onError("Card setup incomplete.");
        return;
      }
      const res = await fetch("/api/billing/confirm-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't confirm card setup.");
      onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save your card.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PaymentElement options={{ layout: "tabs" }} />
      <Button variant="primary" size="md" full icon="credit-card" onClick={() => void submit()} disabled={!stripe || busy}>
        {busy ? "Saving…" : "Save card securely"}
      </Button>
    </div>
  );
}

export function PaymentMethodSetup({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError?: (msg: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/billing/setup-intent", { method: "POST" });
        const data = (await res.json()) as { clientSecret?: string; publishableKey?: string; error?: string };
        if (!res.ok || !data.clientSecret) throw new Error(data.error || "Couldn't start card setup.");
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load payment form.");
      }
    })();
  }, []);

  if (loadError) {
    return <p style={{ fontSize: 14, color: T.coral, margin: 0 }}>{loadError}</p>;
  }
  if (!clientSecret || !publishableKey) {
    return <p style={{ fontSize: 14, color: T.mute, margin: 0 }}>Loading secure payment form…</p>;
  }

  const stripePromise = loadStripe(publishableKey);
  const options: StripeElementsOptions = { clientSecret, appearance: { theme: "stripe" } };

  return (
    <Elements stripe={stripePromise} options={options}>
      <SetupForm onSuccess={onSuccess} onError={onError ?? (() => {})} />
    </Elements>
  );
}
