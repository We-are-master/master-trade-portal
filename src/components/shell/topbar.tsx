"use client";

// TopBar — ported from shell.jsx. Title/breadcrumb, search, notifications, actions.

import { Fragment, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Icon, IconButton } from "@/components/ui/primitives";
import { useIsMobile } from "@/hooks/use-media-query";

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

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 8 : 16,
        padding: isMobile ? "10px 14px" : "14px 24px",
        paddingTop: isMobile ? "max(10px, env(safe-area-inset-top))" : 14,
        borderBottom: `1px solid ${T.line}`,
        background: T.white,
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      <div style={{ flex: 1, display: isMobile && searchOpen ? "none" : "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {breadcrumb.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.mute }}>
            {breadcrumb.map((b, i) => (
              <Fragment key={i}>
                {i > 0 && <Icon name="chevron-right" size={12} />}
                <span style={i === breadcrumb.length - 1 ? { color: T.ink, fontWeight: 500 } : undefined}>
                  {b}
                </span>
              </Fragment>
            ))}
          </div>
        )}
        <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 600, letterSpacing: -0.3, color: T.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      </div>

      {/* Search — a full-width field would crowd the mobile bar, so it collapses
          to an icon that expands over the title. */}
      {(!isMobile || searchOpen) && (
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
              onClick={() => { setSearchOpen(false); setSearch(""); }}
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
      )}

      {isMobile && !searchOpen && (
        <IconButton icon="search" title="Search" tone="ghost" onClick={() => setSearchOpen(true)} />
      )}

      {!(isMobile && searchOpen) && (
        <IconButton icon="bell" title="Notifications" tone={isMobile ? "ghost" : "secondary"} style={{ position: "relative" }} />
      )}

      {isMobile && !searchOpen && onMore && (
        <IconButton icon="more-vertical" title="More" tone="ghost" onClick={onMore} />
      )}

      {!isMobile && actions}
    </header>
  );
}
