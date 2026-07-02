"use client";

// Sidebar, TrialCard, UserMiniCard — ported from shell.jsx.
import { useState, type CSSProperties } from "react";
import { AuthWordmark, BrandPanelBackground } from "@/components/brand/auth-wordmark";
import { T } from "@/lib/tokens";
import { PartnerRatingInline } from "@/components/ui/partner-rating";
import { Avatar, Icon } from "@/components/ui/primitives";
import { usePartnerRating } from "@/hooks/use-partner-rating";
import { usePartner } from "@/components/partner-context";
import { getPlan } from "@/lib/plan-catalog";
import { partnerBillingEnabled } from "@/lib/partner-work-access";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  hot?: boolean;
}

// Original section structure kept; only the item labels are renamed. Badges are
// derived from real data at render time (see Sidebar) — no hardcoded counts.
const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Workspace", items: [{ id: "dashboard", label: "Dashboard", icon: "layout-dashboard" }] },
  {
    section: "Opportunities",
    items: [
      { id: "leads", label: "Hot Leads", icon: "user-plus", hot: true },
      { id: "available", label: "Available Jobs", icon: "wrench" },
      { id: "quotes", label: "Available Quotes", icon: "file-text" },
    ],
  },
  {
    section: "Operations",
    items: [
      { id: "jobs", label: "Active Jobs", icon: "briefcase" },
      { id: "schedule", label: "Schedule", icon: "calendar" },
    ],
  },
  { section: "Account", items: [{ id: "settings", label: "Settings", icon: "settings" }] },
];

export function Wordmark({ color = T.navy, height = 18 }: { color?: string; height?: number }) {
  return (
    <span
      style={{
        fontFamily: T.sans,
        fontSize: height,
        fontWeight: 600,
        letterSpacing: -0.5,
        color,
        lineHeight: 1,
      }}
    >
      fixfy
    </span>
  );
}

export function Sidebar({
  active,
  onNav,
  density = "comfortable",
  workLocked = false,
}: {
  active: string;
  onNav: (id: string) => void;
  density?: "comfortable" | "compact";
  workLocked?: boolean;
}) {
  const isDense = density === "compact";
  const { jobs } = useMyJobs();
  const activeJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress").length;
  // Real, derived badges only (no fabricated counts). Available/quotes/leads would need their
  // own fetch, so they stay unbadged until there's a shared count source.
  const badgeFor = (id: string): number | undefined => (id === "jobs" && activeJobs > 0 ? activeJobs : undefined);
  const lockedNav = new Set(["leads", "available", "quotes", "jobs", "schedule"]);

  function Row({ item }: { item: NavItem }) {
    const sel = item.id === active;
    const [h, setH] = useState(false);
    return (
      <div
        onClick={() => onNav(item.id)}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: isDense ? "6px 10px" : "7px 10px",
          borderRadius: 8,
          background: sel ? "rgba(255,255,255,0.09)" : h ? "rgba(255,255,255,0.05)" : "transparent",
          color: sel ? T.white : "rgba(255,255,255,0.66)",
          fontSize: 13,
          fontWeight: sel ? 500 : 400,
          cursor: "pointer",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        {sel && (
          <span
            style={{
              position: "absolute",
              left: -12,
              top: 6,
              bottom: 6,
              width: 2.5,
              background: T.coral,
              borderRadius: 9999,
            }}
          />
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Icon name={item.icon} size={16} color={sel ? T.white : item.hot ? T.coral : "rgba(255,255,255,0.5)"} />
          {item.label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {workLocked && lockedNav.has(item.id) && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              Locked
            </span>
          )}
        {item.badge != null && (
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 10.5,
              padding: "1px 6px",
              background: T.coral,
              color: T.white,
              borderRadius: 9999,
              fontWeight: 500,
            }}
          >
            {item.badge}
          </span>
        )}
        </span>
      </div>
    );
  }

  return (
    <BrandPanelBackground
      style={{
        width: 240,
        flex: "0 0 240px",
        height: "100vh",
        borderRight: `1px solid rgba(255,255,255,0.06)`,
        display: "flex",
        flexDirection: "column",
        padding: "14px 12px 12px",
      }}
    >
      <div style={{ padding: "4px 8px 16px" }}>
        <AuthWordmark light size={18} />
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {NAV.map((section, si) => (
          <div key={si}>
            {section.section ? (
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.4)",
                  padding: "0 10px 6px",
                  fontWeight: 500,
                }}
              >
                {section.section}
              </div>
            ) : null}
            <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {section.items.map((i) => {
                const badge = badgeFor(i.id);
                return <Row key={i.id} item={badge != null ? { ...i, badge } : i} />;
              })}
            </nav>
          </div>
        ))}
      </div>

      <TrialCard onUpgrade={() => onNav("settings:billing")} />
      <UserMiniCard onSettings={() => onNav("settings")} />
    </BrandPanelBackground>
  );
}

function TrialCard({ onUpgrade }: { onUpgrade: () => void }) {
  const partner = usePartner();
  const plan = getPlan(partner.plan);
  const daysLeft = partner.trialDaysLeft;
  const onTrial = daysLeft > 0 && partner.subscriptionStatus !== "active";
  // Free / un-tiered partners have no platform billing — no plan card at all.
  if (!partnerBillingEnabled(partner)) return null;
  return (
    <div
      style={{
        margin: "12px 0 8px",
        padding: 12,
        borderRadius: 10,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: T.white,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="credit-card" size={14} color={T.coral} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{plan.name}</span>
        {onTrial && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: T.mono,
              fontSize: 11,
              padding: "1px 6px",
              background: T.coral,
              color: T.white,
              borderRadius: 4,
            }}
          >
            {daysLeft}d left
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>
        {plan.priceLabel} · {partner.billingReady ? "Card on file" : "Add card in onboarding"}
      </div>
      <button
        onClick={onUpgrade}
        style={{
          background: T.white,
          color: T.navy,
          border: "none",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: T.sans,
        }}
      >
        Manage plan
      </button>
    </div>
  );
}

function UserMiniCard({ onSettings }: { onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const partner = usePartner();
  const { rating } = usePartnerRating(partner.rating);
  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/login";
  };
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid rgba(255,255,255,0.1)`,
          background: "rgba(255,255,255,0.05)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Avatar initials={partner.initials} size={28} bg={T.coral} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: T.white,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {partner.firstName} {partner.lastName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{partner.primaryTrade}</span>
            <PartnerRatingInline rating={rating} size="xs" dark />
          </div>
        </div>
        <Icon name="chevrons-up-down" size={14} color="rgba(255,255,255,0.5)" />
      </button>
      {open && (
        <div
          className="fx-rise"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: T.white,
            border: `1px solid ${T.line}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(2,0,64,0.10), 0 2px 6px rgba(2,0,64,0.06)",
            padding: 6,
            zIndex: 50,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <MenuItem icon="user" label="Profile" onClick={() => { onSettings(); setOpen(false); }} />
          <MenuItem icon="life-buoy" label="Help & support" />
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
    fontSize: 12.5,
    fontWeight: 400,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: T.sans,
  };
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={style}>
      <Icon name={icon} size={14} color={T.mute} />
      <span>{label}</span>
    </button>
  );
}
