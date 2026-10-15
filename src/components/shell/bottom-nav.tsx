"use client";

// BottomNav — a navegação do celular (redesign 15/10/2026): quatro destinos
// numa barra branca, o ativo marcado pela linha laranja no topo. A conta
// (perfil, áreas, documentos) abre pela folha do avatar no topo.

import { useEffect } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Icon } from "@/components/ui/primitives";
import { PartnerRatingInline } from "@/components/ui/partner-rating";
import { usePartner } from "@/components/partner-context";
import { usePartnerRating } from "@/hooks/use-partner-rating";
import { useOffersCount } from "@/components/offers-context";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS } from "./nav-config";

/** Height of the bar itself, before the home-indicator inset. */
export const BOTTOM_NAV_HEIGHT = 64;

const MORE_ITEMS: { id: string; label: string; icon: string; hint: string }[] = [
  { id: "settings:profile", label: "Profile", icon: "user", hint: "What customers see on your reports" },
  { id: "settings:trades", label: "Trades and skills", icon: "wrench", hint: "The work you take on" },
  { id: "settings:rates", label: "Rate card", icon: "credit-card", hint: "Your call-out and hourly rates" },
  { id: "settings:availability", label: "Availability", icon: "calendar-clock", hint: "When you can work" },
  { id: "settings:area", label: "Service area", icon: "map-pin", hint: "Where you travel to" },
  { id: "settings:policies", label: "Policies", icon: "gavel", hint: "Agreements and payment rules" },
];

export function BottomNav({ active, onNav }: { active: string; onNav: (id: string) => void }) {
  const offers = useOffersCount();
  // Fixed, so it never scrolls away — the page reserves room for it instead.
  return (
    <nav
      aria-label="Main"
      // fx-keep-grid: the mobile stylesheet collapses grids to one column.
      className="fx-keep-grid"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        height: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
        boxSizing: "border-box",
        background: T.white,
        borderTop: `1px solid ${T.line}`,
        fontFamily: T.sans,
      }}
    >
      {NAV_ITEMS.map((t) => {
        const sel = active === t.id;
        const badge = t.id === "offers" && offers > 0 ? offers : undefined;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onNav(t.id)}
            aria-current={sel ? "page" : undefined}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: BOTTOM_NAV_HEIGHT,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              color: sel ? T.ink : T.mute,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {sel && <span style={{ position: "absolute", top: 0, left: "24%", right: "24%", height: 2, background: T.coral }} />}
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={t.icon} size={20} />
              {badge != null && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    boxSizing: "border-box",
                    borderRadius: 9999,
                    background: T.navy,
                    color: T.white,
                    fontSize: 10,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, fontWeight: sel ? 600 : 500 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Bottom sheet holding everything that doesn't earn a tab. */
export function MoreSheet({
  active,
  onNav,
  onClose,
}: {
  active: string;
  onNav: (id: string) => void;
  onClose: () => void;
}) {
  const partner = usePartner();
  const { rating } = usePartnerRating(partner.rating);

  // A fixed sheet over a scrollable page needs the page to hold still.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(2,0,64,0.42)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        animation: "fx-fade-in 160ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Account"
        style={{
          background: T.white,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingBottom: `calc(14px + env(safe-area-inset-bottom))`,
          maxHeight: "82vh",
          overflow: "auto",
          fontFamily: T.sans,
          animation: "fx-sheet-up 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <span style={{ width: 38, height: 4, borderRadius: 9999, background: T.line }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 18px 14px" }}>
          <Avatar initials={partner.initials} size={42} bg={T.coral} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.navy, letterSpacing: -0.2 }}>
              {partner.firstName} {partner.lastName}
            </div>
            <PartnerRatingInline rating={rating} />
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, padding: "8px 10px" }}>
          {MORE_ITEMS.map((item) => {
            const sel = active === item.id.split(":")[0];
            return (
              <button
                key={item.id}
                onClick={() => onNav(item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "11px 12px",
                  border: "none",
                  background: "transparent",
                  borderRadius: 11,
                  cursor: "pointer",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: T.paper2,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={item.icon} size={17} color={sel ? T.coral : T.navy} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.ink }}>{item.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.mute, marginTop: 1 }}>{item.hint}</span>
                </span>
                <Icon name="chevron-right" size={16} color={T.mute} />
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, padding: "10px 22px 4px" }}>
          <button
            onClick={signOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              border: "none",
              background: "transparent",
              padding: "8px 0",
              cursor: "pointer",
              fontSize: 13.5,
              fontWeight: 500,
              color: T.red,
              fontFamily: T.sans,
            }}
          >
            <Icon name="log-out" size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
