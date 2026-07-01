"use client";

import type { ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";

export function ReviewLockOverlay({
  children,
  pageLabel,
  onOpenSettings,
}: {
  children: ReactNode;
  pageLabel?: string;
  onOpenSettings?: () => void;
}) {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          opacity: 0.42,
          filter: "blur(1px)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "linear-gradient(180deg, rgba(248,248,252,0.55) 0%, rgba(248,248,252,0.82) 100%)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            maxWidth: 420,
            width: "100%",
            padding: "28px 26px",
            borderRadius: 16,
            background: T.white,
            border: `1px solid ${T.line}`,
            boxShadow: "0 12px 40px rgba(2,0,64,0.12)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              margin: "0 auto 16px",
              display: "grid",
              placeItems: "center",
              background: T.amber50,
              border: `1px solid ${T.amber}`,
            }}
          >
            <Icon name="clock" size={24} color={T.amber} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.navy, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Account in review
          </div>
          <p style={{ fontSize: 14, color: T.mute, lineHeight: 1.55, margin: "0 0 18px" }}>
            {pageLabel
              ? `${pageLabel} unlocks once Fixfy approves your account. Browse your dashboard below — actions stay paused until then.`
              : "We're reviewing your profile and documents. You can preview your portal now; work actions unlock after approval."}
          </p>
          {onOpenSettings && (
            <Button variant="secondary" size="sm" icon="settings" onClick={onOpenSettings}>
              Update profile in Settings
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
