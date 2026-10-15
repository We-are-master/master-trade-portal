"use client";

// Topo do portal. Desktop: 48px branco com a linha de baixo na altura da linha
// da faixa da logo na sidebar, caminho da página, busca, avisos e ligar para a
// Fixfy. Celular: faixa navy com a logo e o avatar que abre a conta.

import { T } from "@/lib/tokens";
import { Avatar, Icon } from "@/components/ui/primitives";
import { useIsMobile } from "@/hooks/use-media-query";
import { usePartner } from "@/components/partner-context";
import { NAV_BG, SHELL_TOP_H, Wordmark } from "./sidebar";
import { FIXFY_PHONE_TEL } from "./nav-config";

export function TopBar({
  title,
  onAccount,
}: {
  title: string;
  /** Celular: o avatar abre a folha da conta. */
  onAccount?: () => void;
}) {
  const isMobile = useIsMobile();
  const partner = usePartner();

  if (isMobile) {
    return (
      <header
        style={{
          flexShrink: 0,
          height: `calc(56px + env(safe-area-inset-top))`,
          boxSizing: "border-box",
          background: NAV_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "env(safe-area-inset-top) 16px 0",
          zIndex: 40,
        }}
      >
        <Wordmark height={24} />
        <button
          type="button"
          onClick={onAccount}
          aria-label="Account"
          style={{ border: "none", background: "transparent", padding: 4, margin: -4, cursor: "pointer", display: "inline-flex" }}
        >
          <Avatar initials={partner.initials} size={36} bg="rgba(255,255,255,0.14)" />
        </button>
      </header>
    );
  }

  return (
    <header
      style={{
        flexShrink: 0,
        height: SHELL_TOP_H,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 24px",
        background: T.white,
        borderBottom: `1px solid ${T.line}`,
        fontFamily: T.sans,
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minWidth: 0 }}>
        <span style={{ color: T.mute }}>Partner portal</span>
        <span style={{ color: "#B4B4C6" }}>/</span>
        <span style={{ fontWeight: 600, color: T.ink }}>{title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a href={FIXFY_PHONE_TEL} aria-label="Call Fixfy" title="Call Fixfy" style={iconBtn}>
          <Icon name="phone" size={16} />
        </a>
      </div>
    </header>
  );
}

const iconBtn = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: `1px solid ${T.line}`,
  background: T.white,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: T.slate,
  textDecoration: "none",
} as const;
