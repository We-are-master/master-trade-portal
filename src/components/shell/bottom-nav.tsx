"use client";

// BottomNav — the mobile navigation. Replaces the sidebar below the mobile
// breakpoint and behaves like a native tab bar: five destinations with the
// dashboard raised in the middle. Settings and the account live in MoreSheet,
// opened from the top bar's overflow button so the five tabs stay symmetrical.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Icon } from "@/components/ui/primitives";
import { PartnerRatingInline } from "@/components/ui/partner-rating";
import { usePartner } from "@/components/partner-context";
import { usePartnerRating } from "@/hooks/use-partner-rating";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";

/** Height of the bar itself, before the home-indicator inset. */
export const BOTTOM_NAV_HEIGHT = 62;

interface Tab {
  id: string;
  label: string;
  icon: string;
}

// Order mirrors the workflow: find work on the left, run work on the right,
// with the dashboard as the home button in the middle.
const LEFT_TABS: Tab[] = [
  { id: "available", label: "Jobs", icon: "wrench" },
  { id: "quotes", label: "Quotes", icon: "file-text" },
];
const RIGHT_TABS: Tab[] = [
  { id: "jobs", label: "Active", icon: "briefcase" },
  { id: "schedule", label: "Schedule", icon: "calendar" },
];


const MORE_ITEMS: { id: string; label: string; icon: string; hint: string }[] = [
  { id: "settings:profile", label: "Profile", icon: "user", hint: "What customers see on your reports" },
  { id: "settings:trades", label: "Trades & skills", icon: "wrench", hint: "The work you take on" },
  { id: "settings:rates", label: "Rate card", icon: "credit-card", hint: "Your call-out and hourly rates" },
  { id: "settings:availability", label: "Availability", icon: "calendar-clock", hint: "When you can work" },
  { id: "settings:area", label: "Service area", icon: "map-pin", hint: "Where you travel to" },
  { id: "settings:selfbill", label: "Self-bill", icon: "receipt", hint: "Invoices Fixfy issued for you" },
  { id: "settings:docs", label: "Documents", icon: "shield-check", hint: "Insurance and certificates" },
  { id: "settings:policies", label: "Policies", icon: "gavel", hint: "Agreements and payment rules" },
];

export function BottomNav({ active, onNav }: { active: string; onNav: (id: string) => void }) {
  const { jobs } = useMyJobs();
  const activeJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress").length;

  // Fixed, so it never scrolls away — the page reserves room for it instead.
  return (
    <nav
      aria-label="Main"
      // fx-keep-grid: the mobile stylesheet collapses grids to one column;
      // the tab bar is the one grid that must stay five across.
      className="fx-keep-grid"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        alignItems: "flex-end",
        height: BOTTOM_NAV_HEIGHT,
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(2,0,64,0.94)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        fontFamily: T.sans,
      }}
    >
      {LEFT_TABS.map((t) => (
        <TabButton key={t.id} tab={t} active={active} onNav={onNav} />
      ))}

      <HomeButton active={active === "dashboard"} onNav={() => onNav("dashboard")} />

      <TabButton
        tab={RIGHT_TABS[0]}
        active={active}
        onNav={onNav}
        badge={activeJobs > 0 ? activeJobs : undefined}
      />
      <TabButton tab={RIGHT_TABS[1]} active={active} onNav={onNav} />
    </nav>
  );
}

function TabButton({
  tab,
  active,
  onNav,
  badge,
}: {
  tab: Tab;
  active: string;
  onNav: (id: string) => void;
  badge?: number;
}) {
  const sel = active === tab.id;
  return (
    <button
      onClick={() => onNav(tab.id)}
      aria-current={sel ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        height: BOTTOM_NAV_HEIGHT,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        color: sel ? T.white : "rgba(255,255,255,0.5)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ position: "relative", display: "inline-flex" }}>
        <Icon name={tab.icon} size={21} />
        {badge != null && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -9,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 9999,
              background: T.coral,
              color: T.white,
              fontFamily: T.mono,
              fontSize: 10,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid #020040",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10, fontWeight: sel ? 600 : 500, letterSpacing: -0.1 }}>{tab.label}</span>
    </button>
  );
}

/** The raised dashboard button — the anchor of the bar. */
function HomeButton({ active, onNav }: { active: boolean; onNav: () => void }) {
  return (
    <button
      onClick={onNav}
      aria-label="Dashboard"
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        height: BOTTOM_NAV_HEIGHT,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          marginTop: -22,
          borderRadius: 9999,
          background: T.coral,
          color: T.white,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          // The ring is the bar's own navy, so the circle reads as punched out of it.
          boxShadow: active
            ? "0 0 0 4px #020040, 0 6px 20px rgba(237,75,0,0.5)"
            : "0 0 0 4px #020040, 0 5px 14px rgba(237,75,0,0.3)",
          opacity: active ? 1 : 0.92,
          transition: `opacity 160ms ${T.ease}, box-shadow 160ms ${T.ease}`,
        }}
      >
        <Icon name="layout-dashboard" size={23} />
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: active ? 600 : 500,
          color: active ? T.white : "rgba(255,255,255,0.5)",
          marginTop: 3,
          marginBottom: 7,
          letterSpacing: -0.1,
        }}
      >
        Home
      </span>
    </button>
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
        aria-label="More"
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
