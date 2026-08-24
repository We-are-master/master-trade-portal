"use client";

// TopBar — title/breadcrumb, search, notifications, actions, and the partner's
// level progress. The level lives here rather than on the dashboard so the
// goal and the gap to the next level follow the partner across every screen.

import { Fragment, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Icon, IconButton } from "@/components/ui/primitives";
import { useIsMobile } from "@/hooks/use-media-query";
import { usePartnerLevel } from "@/hooks/use-partner-level";
import { PartnerLevelStrip } from "@/components/ui/partner-level-goal";

export function TopBar({
  title,
  breadcrumb = [],
  actions,
  onMore,
}: {
  title: ReactNode;
  breadcrumb?: string[];
  actions?: ReactNode;
  /** Mobile only — opens the overflow sheet holding settings and the account. */
  onMore?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useIsMobile();
  const level = usePartnerLevel();

  const titleBlock = (
    <div style={{ flex: 1, display: isMobile && searchOpen ? "none" : "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      {breadcrumb.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.mute }}>
          {breadcrumb.map((b, i) => (
            <Fragment key={i}>
              {i > 0 && <Icon name="chevron-right" size={12} />}
              <span style={i === breadcrumb.length - 1 ? { color: T.ink, fontWeight: 500 } : undefined}>{b}</span>
            </Fragment>
          ))}
        </div>
      )}
      <div
        style={{
          fontSize: isMobile ? 17 : 20,
          fontWeight: 600,
          letterSpacing: -0.3,
          color: T.navy,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
    </div>
  );

  // A full-width field would crowd the mobile bar, so it collapses to an icon
  // that expands over the title.
  const searchBlock = (!isMobile || searchOpen) && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        height: 36,
        border: `1px solid ${T.line}`,
        borderRadius: 8,
        width: isMobile ? "auto" : 280,
        flex: isMobile ? 1 : "none",
        color: T.mute,
        fontSize: 13,
        background: T.white,
      }}
    >
      <Icon name="search" size={14} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus={isMobile}
        placeholder={isMobile ? "Search…" : "Search jobs, leads, customers…"}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: T.sans,
          // 16px stops iOS Safari zooming the page on focus.
          fontSize: isMobile ? 16 : 13,
          color: T.ink,
          minWidth: 0,
        }}
      />
      {isMobile ? (
        <button
          onClick={() => {
            setSearchOpen(false);
            setSearch("");
          }}
          aria-label="Close search"
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: T.mute, display: "inline-flex" }}
        >
          <Icon name="x" size={15} />
        </button>
      ) : (
        <span
          style={{
            fontFamily: T.mono,
            fontSize: 10.5,
            padding: "1px 5px",
            borderRadius: 4,
            background: T.paper,
            border: `1px solid ${T.line}`,
            color: T.mute,
          }}
        >
          ⌘K
        </span>
      )}
    </div>
  );

  const controls = (
    <>
      {isMobile && !searchOpen && <IconButton icon="search" title="Search" tone="ghost" onClick={() => setSearchOpen(true)} />}
      {!(isMobile && searchOpen) && (
        <IconButton icon="bell" title="Notifications" tone={isMobile ? "ghost" : "secondary"} style={{ position: "relative" }} />
      )}
      {isMobile && !searchOpen && onMore && <IconButton icon="more-vertical" title="More" tone="ghost" onClick={onMore} />}
      {!isMobile && actions}
    </>
  );

  return (
    <header
      style={{
        display: "flex",
        // Mobile stacks: title row on top, the level strip on its own line
        // underneath, because neither survives sharing 375px with the icons.
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 8 : 16,
        padding: isMobile ? "10px 14px" : "14px 24px",
        paddingTop: isMobile ? "max(10px, env(safe-area-inset-top))" : 14,
        borderBottom: `1px solid ${T.line}`,
        background: T.white,
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {isMobile ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {titleBlock}
            {searchBlock}
            {controls}
          </div>
          {!searchOpen && <PartnerLevelStrip level={level} stacked />}
        </>
      ) : (
        <>
          {titleBlock}
          <div style={{ width: 240, flexShrink: 0 }}>
            <PartnerLevelStrip level={level} />
          </div>
          {searchBlock}
          {controls}
        </>
      )}
    </header>
  );
}
