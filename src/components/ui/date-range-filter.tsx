"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/icon";
import {
  DATE_FILTER_QUICK_OPTIONS,
  type DateFilterMode,
  type DateFilterValue,
} from "@/lib/date-range-filter";

export function DateRangeFilter({
  value,
  onChange,
  style,
}: {
  value: DateFilterValue;
  onChange: (next: DateFilterValue) => void;
  style?: CSSProperties;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  const selectQuick = (id: DateFilterMode) => {
    onChange({ ...value, mode: id });
    setOverflowOpen(false);
  };

  const isCustom = value.mode === "custom";

  const chip = (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 12.5,
    fontWeight: 500,
    fontFamily: T.sans,
    cursor: "pointer",
    border: `1px solid ${active ? T.coral : T.line}`,
    background: active ? T.coral : T.white,
    color: active ? T.white : T.slate,
    transition: `all 120ms ${T.ease}`,
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", ...style }}>
      <div
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          gap: 4,
          padding: 3,
          borderRadius: 8,
          background: T.paper2,
          border: `1px solid ${T.line}`,
        }}
      >
        {DATE_FILTER_QUICK_OPTIONS.map((opt) => (
          <button key={opt.id} type="button" onClick={() => selectQuick(opt.id)} style={chip(value.mode === opt.id)}>
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Custom date range"
          onClick={() => setOverflowOpen((v) => !v)}
          style={{
            ...chip(isCustom),
            padding: "5px 8px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="more-horizontal" size={14} color={isCustom ? T.white : T.slate} />
        </button>
      </div>

      {overflowOpen ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 50,
            width: 260,
            borderRadius: 12,
            border: `1px solid ${T.line}`,
            background: T.white,
            boxShadow: "0 8px 24px rgba(2,0,64,0.12)",
            padding: 12,
          }}
        >
          <button
            type="button"
            onClick={() => onChange({ ...value, mode: "custom" })}
            style={{
              ...chip(isCustom),
              width: "100%",
              textAlign: "left",
              marginBottom: isCustom ? 10 : 0,
            }}
          >
            Custom range
          </button>
          {isCustom ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: T.mute, marginBottom: 4 }}>
                  FROM
                </label>
                <input
                  type="date"
                  value={value.customFrom ?? ""}
                  onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
                  style={{
                    width: "100%",
                    height: 32,
                    fontSize: 12,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: `1px solid ${T.line}`,
                    fontFamily: T.sans,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: T.mute, marginBottom: 4 }}>
                  TO
                </label>
                <input
                  type="date"
                  value={value.customTo ?? ""}
                  onChange={(e) => onChange({ ...value, customTo: e.target.value })}
                  style={{
                    width: "100%",
                    height: 32,
                    fontSize: 12,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: `1px solid ${T.line}`,
                    fontFamily: T.sans,
                  }}
                />
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setOverflowOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 11,
                color: T.mute,
                cursor: "pointer",
                fontFamily: T.sans,
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
