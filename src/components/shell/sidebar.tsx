"use client";

// Sidebar, TrialCard, UserMiniCard — ported from shell.jsx.
// The brand logo asset isn't bundled, so the lowercase `fixfy` wordmark is rendered as text.

import { useState, type CSSProperties } from "react";
import { T } from "@/lib/tokens";
import { Avatar, Icon } from "@/components/ui/primitives";
import { usePartner } from "@/components/partner-context";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  hot?: boolean;
}

// Badges are derived from real data at render time (see Sidebar). No hardcoded counts.
const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Workspace", items: [{ id: "dashboard", label: "Dashboard", icon: "layout-dashboard" }] },
  {
    section: "Opportunities",
    items: [
      { id: "leads", label: "Leads", icon: "sparkles" },
      { id: "available", label: "Available jobs", icon: "wrench" },
      { id: "quotes", label: "Available quotes", icon: "file-text" },
    ],
  },
  {
    section: "Operations",
    items: [
      { id: "jobs", label: "My jobs", icon: "briefcase" },
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
  onOpenOnboarding,
  density = "comfortable",
}: {
  active: string;
  onNav: (id: string) => void;
  onOpenOnboarding: () => void;
  density?: "comfortable" | "compact";
}) {
  const isDense = density === "compact";
  const { jobs } = useMyJobs();
  const activeJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress").length;
  // Real, derived badges only (no fabricated counts). Available/quotes/leads would need their
  // own fetch, so they stay unbadged until there's a shared count source.
  const badgeFor = (id: string): number | undefined => (id === "jobs" && activeJobs > 0 ? activeJobs : undefined);

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
          background: sel ? T.paper : h ? "rgba(2,0,64,0.04)" : "transparent",
          color: sel ? T.navy : T.slate,
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
          <Icon name={item.icon} size={16} color={sel ? T.navy : T.mute} />
          {item.label}
        </span>
        {item.badge != null && (
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 10.5,
              padding: "1px 6px",
              background: item.hot ? T.coralTint : sel ? T.navy : T.line,
              color: item.hot ? T.coral : sel ? T.white : T.slate,
              borderRadius: 9999,
              fontWeight: 500,
            }}
          >
            {item.badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <aside
      style={{
        width: 240,
        flex: "0 0 240px",
        height: "100vh",
        background: T.white,
        borderRight: `1px solid ${T.line}`,
        display: "flex",
        flexDirection: "column",
        padding: "14px 12px 12px",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "4px 8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <Wordmark />
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: T.mute,
            padding: "2px 6px",
            background: T.paper2,
            borderRadius: 4,
            letterSpacing: 0.4,
            marginLeft: "auto",
          }}
        >
          TRADE
        </span>
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {NAV.map((section) => (
          <div key={section.section}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: T.mute,
                padding: "0 10px 6px",
                fontWeight: 500,
              }}
            >
              {section.section}
            </div>
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
      <UserMiniCard onOpenOnboarding={onOpenOnboarding} onSettings={() => onNav("settings")} />
    </aside>
  );
}

function TrialCard({ onUpgrade }: { onUpgrade: () => void }) {
  const partner = usePartner();
  const daysLeft = partner.trialDaysLeft;
  const onTrial = daysLeft > 0;
  return (
    <div
      style={{
        margin: "12px 0 8px",
        padding: 12,
        borderRadius: 10,
        background: T.navy,
        color: T.white,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="clock" size={14} color={T.coral} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{onTrial ? "Free trial" : "Fixfy Pro"}</span>
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
        {onTrial ? (
          <>
            £99/mo from <span className="fx-mono">{partner.trialEndsOn}</span>. No commission. Cancel anytime.
          </>
        ) : (
          <>£99/mo · 0% commission on every job. Cancel anytime.</>
        )}
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

function UserMiniCard({
  onSettings,
  onOpenOnboarding,
}: {
  onSettings: () => void;
  onOpenOnboarding: () => void;
}) {
  const [open, setOpen] = useState(false);
  const partner = usePartner();
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
          border: `1px solid ${T.line}`,
          background: T.white,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Avatar initials={partner.initials} size={28} bg={T.navy} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: T.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {partner.firstName} {partner.lastName}
          </div>
          <div style={{ fontSize: 11, color: T.mute }}>{partner.primaryTrade}</div>
        </div>
        <Icon name="chevrons-up-down" size={14} color={T.mute} />
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
          <MenuItem icon="play-circle" label="Re-run onboarding" onClick={() => { onOpenOnboarding(); setOpen(false); }} />
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
