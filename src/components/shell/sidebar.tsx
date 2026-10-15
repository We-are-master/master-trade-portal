"use client";

// Sidebar do desktop, no desenho do OS: faixa da logo com 48px e a linha de
// baixo alinhada à do topo, quatro destinos e o cartão do parceiro no pé.

import { useState, type CSSProperties } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Icon } from "@/components/ui/primitives";
import { usePartner } from "@/components/partner-context";
import { useOffersCount } from "@/components/offers-context";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS } from "./nav-config";

export const NAV_BG = "#0A0A28";
export const SHELL_TOP_H = 48;
const NAV_LINE = "rgba(255,255,255,0.08)";

export function Wordmark({ height = 26 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logos/fixfy-wordmark-white-coral.png" alt="Fixfy" style={{ height, width: "auto", display: "block" }} />;
}

export function Sidebar({ active, onNav }: { active: string; onNav: (id: string) => void }) {
  const offers = useOffersCount();
  return (
    <aside
      style={{
        width: 216,
        flex: "0 0 216px",
        height: "100vh",
        background: NAV_BG,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.sans,
      }}
    >
      <div
        style={{
          height: SHELL_TOP_H,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: `1px solid ${NAV_LINE}`,
          boxSizing: "border-box",
        }}
      >
        <Wordmark />
      </div>

      <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, flex: 1, overflow: "auto" }}>
        {NAV_ITEMS.map((item) => (
          <SideItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            selected={item.id === active}
            count={item.id === "offers" && offers > 0 ? offers : undefined}
            onClick={() => onNav(item.id)}
          />
        ))}
      </nav>

      <PartnerCard selected={active === "settings"} onAccount={() => onNav("settings")} />
    </aside>
  );
}

function SideItem({
  label,
  icon,
  selected,
  count,
  onClick,
}: {
  label: string;
  icon: string;
  selected: boolean;
  count?: number;
  onClick: () => void;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      aria-current={selected ? "page" : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 36,
        padding: "0 12px",
        border: "none",
        borderRadius: 6,
        background: selected ? "rgba(255,255,255,0.08)" : h ? "rgba(255,255,255,0.05)" : "transparent",
        color: selected || h ? T.white : "rgba(255,255,255,0.62)",
        fontFamily: T.sans,
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {selected && (
        <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: T.coral }} />
      )}
      <Icon name={icon} size={16} />
      <span style={{ flex: 1 }}>{label}</span>
      {count != null && (
        <span
          style={{
            minWidth: 20,
            height: 18,
            padding: "0 6px",
            boxSizing: "border-box",
            borderRadius: 6,
            background: "rgba(237,75,0,0.18)",
            color: "#FFB08A",
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function PartnerCard({ selected, onAccount }: { selected: boolean; onAccount: () => void }) {
  const [open, setOpen] = useState(false);
  const partner = usePartner();
  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/login";
  };
  const name = `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim() || "Your account";
  return (
    <div style={{ position: "relative", margin: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 12,
          border: "none",
          borderRadius: 10,
          background: selected ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: T.sans,
        }}
      >
        <Avatar initials={partner.initials} size={32} bg={T.coral} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            title={name}
            style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {name}
          </span>
          <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.62)" }}>Account and documents</span>
        </span>
        <Icon name="chevrons-up-down" size={14} color="rgba(255,255,255,0.5)" />
      </button>
      {open && (
        <div
          className="fx-rise"
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: T.white,
            border: `1px solid ${T.line}`,
            borderRadius: 10,
            boxShadow: "0 4px 6px -2px rgba(10,10,31,0.20)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <MenuItem icon="user" label="Account" onClick={() => { onAccount(); setOpen(false); }} />
          <div style={{ height: 1, background: T.line, margin: "6px 4px" }} />
          <MenuItem icon="log-out" label="Sign out" onClick={signOut} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  const [h, setH] = useState(false);
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "none",
    background: h ? T.paper : "transparent",
    color: T.ink,
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: T.sans,
  };
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={style}>
      <Icon name={icon} size={14} color={T.mute} />
      <span>{label}</span>
    </button>
  );
}
