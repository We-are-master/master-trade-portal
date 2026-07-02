"use client";

import type { ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";

export function ReviewLockOverlay({
  children,
  pageLabel,
  onPrimaryAction,
  onMinimize,
}: {
  children: ReactNode;
  pageLabel?: string;
  onPrimaryAction?: () => void;
  onMinimize?: () => void;
}) {
  const message = pageLabel
    ? `${pageLabel} unlocks once Fixfy approves your account in the OS. Browse below — customer details and actions stay paused until then.`
    : "We're reviewing your profile and documents in the OS. You can preview your portal now; work actions unlock after approval.";

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          opacity: 0.38,
          filter: "blur(2px)",
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
          padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
          background: "linear-gradient(180deg, rgba(248,248,252,0.6) 0%, rgba(248,248,252,0.88) 100%)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            maxWidth: 420,
            width: "100%",
            padding: "22px 20px",
            borderRadius: 16,
            background: T.white,
            border: `1px solid ${T.line}`,
            boxShadow: "0 12px 40px rgba(2,0,64,0.12)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
              background: T.amber50,
              border: `1px solid ${T.amber}`,
            }}
          >
            <Icon name="clock" size={22} color={T.amber} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.navy, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Awaiting OS approval
          </div>
          <p style={{ fontSize: 14, color: T.mute, lineHeight: 1.55, margin: "0 0 16px" }}>{message}</p>
          {onPrimaryAction && (
            <Button variant="secondary" size="sm" icon="settings" onClick={onPrimaryAction}>
              Update profile in Settings
            </Button>
          )}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              style={{
                display: "block",
                width: "100%",
                marginTop: 12,
                padding: 0,
                border: "none",
                background: "none",
                fontFamily: T.sans,
                fontSize: 13,
                color: T.mute,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Browse portal — details stay locked until approval
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
