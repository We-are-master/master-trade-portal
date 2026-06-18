"use client";

import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";
import {
  PLAN_ORDER,
  annualSavingsCopy,
  getPlan,
  type PlanId,
} from "@/lib/plan-catalog";

export function PlanSummaryCard({ planId }: { planId: string }) {
  const plan = getPlan(planId);
  const highlighted = plan.highlighted;

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 14,
        background: highlighted ? T.navy : T.white,
        color: highlighted ? T.white : T.ink,
        border: highlighted ? `2px solid ${T.coral}` : `1px solid ${T.line}`,
        boxShadow: highlighted ? "0 8px 28px rgba(2,0,64,0.12)" : undefined,
      }}
    >
      {plan.badge && (
        <div
          style={{
            display: "inline-block",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "4px 8px",
            borderRadius: 6,
            background: T.coral,
            color: T.white,
            marginBottom: 10,
          }}
        >
          {plan.badge}
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{plan.name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: highlighted ? T.coral : T.navy }}>
        {plan.priceLabel}
      </div>
      {plan.id === "vip" && (
        <div style={{ fontSize: 13, marginTop: 6, color: highlighted ? "rgba(255,255,255,0.8)" : T.coral, fontWeight: 600 }}>
          {annualSavingsCopy()}
        </div>
      )}
      <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5, color: highlighted ? "rgba(255,255,255,0.82)" : T.slate }}>
        {plan.tagline}
      </p>
      <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", gap: 8, fontSize: 13, color: highlighted ? "rgba(255,255,255,0.88)" : T.slate }}>
            <Icon name="check" size={14} color={T.coral} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanPickerGrid({
  selected,
  onSelect,
  compact = false,
}: {
  selected: PlanId;
  onSelect?: (id: PlanId) => void;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
      }}
    >
      {PLAN_ORDER.map((id) => {
        const plan = getPlan(id);
        const isSelected = id === selected;
        const highlighted = plan.highlighted;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            style={{
              textAlign: "left",
              padding: 18,
              borderRadius: 14,
              cursor: onSelect ? "pointer" : "default",
              background: highlighted ? T.navy : T.white,
              color: highlighted ? T.white : T.ink,
              border: isSelected ? `2px solid ${T.coral}` : `1px solid ${T.line}`,
              boxShadow: highlighted ? "0 8px 24px rgba(2,0,64,0.1)" : undefined,
            }}
          >
            {plan.badge && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.coral, textTransform: "uppercase" }}>
                {plan.badge}
              </span>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{plan.name}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: highlighted ? T.coral : T.navy }}>
              {plan.priceLabel}
            </div>
            {id === "vip" && (
              <div style={{ fontSize: 12, marginTop: 4, color: highlighted ? "rgba(255,255,255,0.75)" : T.coral }}>
                {annualSavingsCopy()}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
