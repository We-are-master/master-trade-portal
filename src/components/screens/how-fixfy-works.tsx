"use client";

// How Fixfy Trade works — collapsible info card shown inside the portal
// (dashboard / welcome board). Replaces the old wizard step. Pulls payout
// terms + cancellation fee from the OS via /api/portal/policies so ops can
// tune them without a portal deploy.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { Card, Icon } from "@/components/ui/primitives";

interface PortalPolicies {
  companyName: string;
  supportEmail: string;
  payoutTerms: string;
  partnerCancelFeeGbp: number;
  currency: string;
}

export function HowFixfyWorksCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [policies, setPolicies] = useState<PortalPolicies | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/policies", { headers: { Accept: "application/json" } });
        const j = (await r.json().catch(() => null)) as PortalPolicies | null;
        if (!cancelled && j) setPolicies(j);
      } catch {
        /* defaults below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payoutTerms = policies?.payoutTerms ?? "Every 2 weeks on Friday";
  const cancelFee = policies?.partnerCancelFeeGbp ?? 50;
  const supportEmail = policies?.supportEmail ?? "support@getfixfy.com";
  const currency = policies?.currency === "USD" ? "$" : "£";

  const tiles = [
    {
      icon: "hand-metal",
      tint: T.coral,
      title: "Jobs come in as offers",
      body: "Every lead, quote and booked job hits your inbox as an offer. Accept or decline in seconds — the first partner who accepts locks it in.",
    },
    {
      icon: "pound-sterling",
      tint: "#0E8A5F",
      title: "Payouts land like clockwork",
      body: `${payoutTerms}. We generate the self-bill PDF for you — no invoicing, no chasing.`,
    },
    {
      icon: "calendar-clock",
      tint: "#020040",
      title: "Cancellations have a floor",
      body: `If you have to cancel a booked job, ${currency}${cancelFee.toFixed(0)} covers our re-booking cost. Reschedule with the office to avoid it.`,
    },
    {
      icon: "file-check",
      tint: "#8B5CF6",
      title: "One self-bill agreement",
      body: "You signed a single self-bill agreement covering every completed week. No POs, no invoices — Fixfy invoices itself on your behalf.",
    },
    {
      icon: "life-buoy",
      tint: "#0B5FFF",
      title: "Support that answers",
      body: `WhatsApp us or email ${supportEmail} — real humans, most replies inside 30 minutes during working hours.`,
    },
  ];

  return (
    <Card style={{ overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          borderBottom: open ? `1px solid ${T.line}` : "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: T.sans,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${T.coral}15`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="compass" size={16} color={T.coral} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: T.navy }}>How Fixfy Trade works</div>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
            Offers, payouts, cancellations &amp; support — the 30-second version.
          </div>
        </div>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={T.mute} />
      </button>

      {open && (
        <div
          style={{
            padding: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((tile) => (
            <div
              key={tile.title}
              style={{
                padding: "14px 14px 12px",
                borderRadius: 12,
                background: T.paper,
                border: `1px solid ${T.line}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${tile.tint}15`,
                  border: `1px solid ${tile.tint}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={tile.icon} size={16} color={tile.tint} />
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: "-0.01em" }}>
                {tile.title}
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>{tile.body}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
