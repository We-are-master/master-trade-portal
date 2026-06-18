"use client";

import type { PlanId } from "@/lib/plan-catalog";

async function postJson(path: string, body?: object): Promise<{ url?: string; error?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Unexpected response" }));
}

export async function startCheckout(plan?: PlanId): Promise<void> {
  const data = await postJson("/api/billing/checkout", plan ? { plan } : undefined);
  if (data.url) window.location.href = data.url;
  else alert(data.error || "Couldn't start checkout. Are Stripe prices configured?");
}

export async function openBillingPortal(): Promise<void> {
  const data = await postJson("/api/billing/portal");
  if (data.url) window.location.href = data.url;
  else alert(data.error === "no_subscription" ? "No subscription yet — add your plan first." : data.error || "Couldn't open billing portal.");
}
