"use client";

// Shared primitives — ported from the design prototype (primitives.jsx).
// Badge, Button, IconButton, Card, Avatar, Input, Toggle, Tabs, EmptyState,
// SectionHeader, StatCard, StatusDot, Modal, Field. Styled with the `T` tokens.

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { T } from "@/lib/tokens";
import { useIsMobile } from "@/hooks/use-media-query";
import { Icon } from "./icon";

export { Icon } from "./icon";

type ToneStyle = { bg: string; fg: string; bd?: string };

// ---------- Badge ----------
const BADGE_TONES: Record<string, ToneStyle> = {
  success: { bg: T.green50, fg: T.green },
  warning: { bg: T.amber50, fg: T.amber },
  danger: { bg: T.red50, fg: T.red },
  info: { bg: T.blue50, fg: T.blue },
  coral: { bg: T.coralTint, fg: T.coral },
  navy: { bg: T.navy, fg: T.white },
  neutral: { bg: T.paper, fg: T.slate, bd: T.line },
  soft: { bg: T.paper2, fg: T.slate },
  scheduled: { bg: T.blue50, fg: T.blue },
  in_progress: { bg: T.coralTint, fg: T.coral },
  awaiting: { bg: T.amber50, fg: T.amber },
  final_check: { bg: T.amber50, fg: T.amber },
  completed: { bg: T.green50, fg: T.green },
  cancelled: { bg: T.paper, fg: T.slate, bd: T.line },
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  icon,
  size = "md",
  style,
}: {
  tone?: string;
  children?: ReactNode;
  dot?: boolean;
  icon?: string;
  size?: "sm" | "md";
  style?: CSSProperties;
}) {
  const v = BADGE_TONES[tone] || BADGE_TONES.neutral;
  const sizes = {
    sm: { px: 7, py: 2, fs: 10.5, gap: 5, dotSize: 4 },
    md: { px: 9, py: 3, fs: 11, gap: 6, dotSize: 5 },
  } as const;
  const s = sizes[size];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        whiteSpace: "nowrap",
        padding: `${s.py}px ${s.px}px`,
        borderRadius: 9999,
        background: v.bg,
        color: v.fg,
        border: v.bd ? `1px solid ${v.bd}` : "none",
        fontSize: s.fs,
        fontWeight: 500,
        letterSpacing: 0.1,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: s.dotSize, height: s.dotSize, borderRadius: 9999, background: v.fg }} />
      )}
      {icon && <Icon name={icon} size={s.fs + 1} />}
      {children}
    </span>
  );
}

// ---------- Button ----------
type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "dark"
  | "danger"
  | "success"
  | "ghost_dark";

const BTN_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; bd: string; hover: string; press: string }> = {
  primary: { bg: T.coral, fg: T.white, bd: "transparent", hover: T.coralHover, press: T.coralPress },
  secondary: { bg: T.white, fg: T.navy, bd: T.line, hover: T.paper, press: T.paper2 },
  ghost: { bg: "transparent", fg: T.navy, bd: "transparent", hover: T.paper, press: T.paper2 },
  dark: { bg: T.navy, fg: T.white, bd: "transparent", hover: T.navySoft, press: T.navyDeep },
  danger: { bg: T.red, fg: T.white, bd: "transparent", hover: "#B20E29", press: "#A30C25" },
  success: { bg: T.green, fg: T.white, bd: "transparent", hover: "#0C7A52", press: "#0A6A47" },
  ghost_dark: { bg: "rgba(255,255,255,0.08)", fg: T.white, bd: "transparent", hover: "rgba(255,255,255,0.14)", press: "rgba(255,255,255,0.2)" },
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconRight,
  onClick,
  style,
  disabled,
  full,
  type = "button",
}: {
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md" | "lg";
  children?: ReactNode;
  icon?: string;
  iconRight?: string;
  onClick?: () => void;
  style?: CSSProperties;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
}) {
  const v = BTN_VARIANTS[variant];
  const sizes = {
    xs: { h: 24, px: 8, fs: 11, r: 6, ig: 4, is: 12 },
    sm: { h: 30, px: 10, fs: 12, r: 8, ig: 5, is: 14 },
    md: { h: 36, px: 14, fs: 13, r: 10, ig: 6, is: 16 },
    lg: { h: 44, px: 18, fs: 14, r: 10, ig: 8, is: 18 },
  } as const;
  const s = sizes[size];
  const [h, setH] = useState(false);
  const [p, setP] = useState(false);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => {
        setH(false);
        setP(false);
      }}
      onMouseDown={() => setP(true)}
      onMouseUp={() => setP(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: s.ig,
        height: s.h,
        padding: `0 ${s.px}px`,
        borderRadius: s.r,
        border: `1px solid ${v.bd}`,
        background: disabled ? T.paper2 : p ? v.press : h ? v.hover : v.bg,
        color: disabled ? T.mute : v.fg,
        fontFamily: T.sans,
        fontSize: s.fs,
        fontWeight: 500,
        letterSpacing: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: `background 120ms ${T.ease}`,
        width: full ? "100%" : "auto",
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={s.is} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.is} />}
    </button>
  );
}

// ---------- IconButton ----------
const ICONBTN_TONES: Record<string, { bg: string; fg: string; bd: string; hover: string }> = {
  secondary: { bg: T.white, fg: T.slate, bd: T.line, hover: T.paper },
  ghost: { bg: "transparent", fg: T.slate, bd: "transparent", hover: T.paper },
  dark: { bg: T.navy, fg: T.white, bd: "transparent", hover: T.navySoft },
  coral: { bg: T.coralTint, fg: T.coral, bd: "transparent", hover: "#FFE3D2" },
};

export function IconButton({
  icon,
  size = 36,
  onClick,
  tone = "secondary",
  style,
  title,
}: {
  icon: string;
  size?: number;
  onClick?: () => void;
  tone?: "secondary" | "ghost" | "dark" | "coral";
  style?: CSSProperties;
  title?: string;
}) {
  const [h, setH] = useState(false);
  const v = ICONBTN_TONES[tone];
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: h ? v.hover : v.bg,
        border: `1px solid ${v.bd}`,
        color: v.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: `background 120ms ${T.ease}`,
        ...style,
      }}
    >
      <Icon name={icon} size={size <= 28 ? 14 : 16} />
    </button>
  );
}

// ---------- Card ----------
export function Card({
  children,
  style,
  onClick,
  hover = false,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: T.white,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        boxShadow: h ? "0 1px 2px rgba(2,0,64,0.06), 0 1px 1px rgba(2,0,64,0.04)" : "none",
        cursor: onClick ? "pointer" : "default",
        transition: `box-shadow 120ms ${T.ease}, border-color 120ms ${T.ease}`,
        borderColor: h ? T.lineStrong : T.line,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------- Avatar ----------
export function Avatar({
  initials,
  size = 32,
  bg = T.navy,
  fg = T.white,
  src,
  style,
}: {
  initials?: string;
  size?: number;
  bg?: string;
  fg?: string;
  src?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: src ? T.paper2 : bg,
        color: fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 600,
        fontFamily: T.sans,
        flexShrink: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </div>
  );
}

// ---------- Input ----------
export function Input({
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
  size = "md",
  style,
  suffix,
  prefix,
  autoFocus,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  icon?: string;
  type?: string;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
  suffix?: ReactNode;
  prefix?: ReactNode;
  autoFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const sizes = {
    sm: { h: 30, fs: 12, px: 10 },
    md: { h: 36, fs: 13, px: 12 },
    lg: { h: 42, fs: 14, px: 14 },
  } as const;
  const s = sizes[size];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: s.h,
        padding: `0 ${s.px}px`,
        borderRadius: 8,
        border: `1px solid ${focus ? T.navy : T.line}`,
        background: T.white,
        transition: `border-color 120ms ${T.ease}, box-shadow 120ms ${T.ease}`,
        boxShadow: focus ? "0 0 0 2px rgba(237,75,0,0.18)" : "none",
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={14} color={T.mute} />}
      {prefix && <span style={{ fontSize: s.fs, color: T.mute }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        readOnly={!onChange}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: T.sans,
          fontSize: s.fs,
          color: T.ink,
          height: "100%",
          minWidth: 0,
        }}
      />
      {suffix && <span style={{ fontSize: s.fs, color: T.mute }}>{suffix}</span>}
    </div>
  );
}

// ---------- Toggle ----------
export function Toggle({
  on,
  onChange,
  label,
  hint,
  size = "md",
  disabled,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes = { sm: { w: 28, h: 16, d: 12 }, md: { w: 36, h: 20, d: 16 } } as const;
  const s = sizes[size];
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.85 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && onChange && onChange(!on)}
        disabled={disabled}
        style={{
          width: s.w,
          height: s.h,
          padding: 2,
          borderRadius: 9999,
          background: on ? T.coral : T.line,
          border: "none",
          cursor: disabled ? "default" : "pointer",
          position: "relative",
          transition: `background 120ms ${T.ease}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: "block",
            width: s.d,
            height: s.d,
            borderRadius: 9999,
            background: T.white,
            transform: `translateX(${on ? s.w - s.d - 4 : 0}px)`,
            transition: `transform 120ms ${T.ease}`,
            boxShadow: "0 1px 2px rgba(2,0,64,0.2)",
          }}
        />
      </button>
      {label && (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</span>
          {hint && <span style={{ fontSize: 12, color: T.mute }}>{hint}</span>}
        </span>
      )}
    </label>
  );
}

// ---------- Tabs ----------
export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  count?: number | string;
}

export function Tabs({
  tabs,
  active,
  onChange,
  style,
  variant = "underline",
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  style?: CSSProperties;
  variant?: "underline" | "pills";
}) {
  if (variant === "pills") {
    return (
      <div
        style={{
          display: "inline-flex",
          padding: 3,
          borderRadius: 9,
          background: T.paper2,
          border: `1px solid ${T.line}`,
          gap: 2,
          ...style,
        }}
      >
        {tabs.map((t) => {
          const sel = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: sel ? T.white : "transparent",
                color: sel ? T.navy : T.slate,
                boxShadow: sel ? "0 1px 2px rgba(2,0,64,0.06)" : "none",
                fontFamily: T.sans,
                fontSize: 12.5,
                fontWeight: 500,
                transition: `all 120ms ${T.ease}`,
              }}
            >
              {t.icon && <Icon name={t.icon} size={14} />}
              {t.label}
              {t.count != null && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: T.mono,
                    padding: "0 5px",
                    borderRadius: 9999,
                    minWidth: 16,
                    textAlign: "center",
                    background: sel ? T.coralTint : T.line,
                    color: sel ? T.coral : T.slate,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${T.line}`, gap: 4, ...style }}>
      {tabs.map((t) => {
        const sel = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "12px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: sel ? T.navy : T.slate,
              fontFamily: T.sans,
              fontSize: 13,
              fontWeight: 500,
              borderBottom: `2px solid ${sel ? T.coral : "transparent"}`,
              marginBottom: -1,
              transition: `color 120ms ${T.ease}`,
            }}
          >
            {t.icon && <Icon name={t.icon} size={15} />}
            {t.label}
            {t.count != null && (
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: T.mono,
                  padding: "0 5px",
                  borderRadius: 9999,
                  minWidth: 16,
                  textAlign: "center",
                  background: sel ? T.coralTint : T.paper2,
                  color: sel ? T.coral : T.slate,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Empty state ----------
export function EmptyState({
  icon = "inbox",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        color: T.mute,
        fontFamily: T.sans,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: T.paper2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Icon name={icon} size={24} color={T.mute} />
        </div>
        <div style={{ fontSize: 16, color: T.ink, fontWeight: 500, marginBottom: 4 }}>{title}</div>
        {hint && <div style={{ fontSize: 13, color: T.mute, lineHeight: 1.5 }}>{hint}</div>}
        {action && <div style={{ marginTop: 16 }}>{action}</div>}
      </div>
    </div>
  );
}

// ---------- Section header ----------
export function SectionHeader({
  title,
  subtitle,
  actions,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: "flex",
        // Actions (filters, view switchers) are far too wide to sit beside the
        // title on a phone — they squeeze it to one letter per line.
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "flex-end",
        gap: isMobile ? 10 : 16,
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 600, letterSpacing: -0.3, color: T.navy }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

// ---------- Stat / KPI card ----------
export function StatCard({
  label,
  value,
  hint,
  accent,
  hero,
  icon,
  valueSuffix,
  progress,
  footer,
  style,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "coral" | "amber" | "green";
  hero?: boolean;
  icon?: string;
  /** Muted word sitting next to the number, e.g. "earned". */
  valueSuffix?: ReactNode;
  /** How far through a cycle the card is, with a caption on each end. */
  progress?: { pct: number; left: ReactNode; right: ReactNode };
  /** Rendered under a hairline rule — used for the pay run strip. */
  footer?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const isMobile = useIsMobile();
  // Three counters share a row on mobile — they need to shrink to fit.
  const compact = isMobile && !hero;
  return (
    <Card
      onClick={onClick}
      hover={!!onClick}
      style={{
        padding: hero ? 18 : compact ? 11 : 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: hero ? T.navy : T.white,
        borderColor: hero ? T.navy : T.line,
        color: hero ? T.white : T.ink,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: compact ? 9.5 : 11.5,
          letterSpacing: compact ? 0.2 : 0.4,
          textTransform: "uppercase",
          color: hero ? "rgba(255,255,255,0.64)" : T.mute,
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        {icon && !compact && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontSize: hero ? 34 : compact ? 21 : 28,
            fontWeight: 600,
            letterSpacing: -0.6,
            color: hero ? T.white : T.navy,
            fontFamily: T.sans,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {valueSuffix && (
          <span style={{ fontSize: 12, color: hero ? "rgba(255,255,255,0.55)" : T.mute }}>{valueSuffix}</span>
        )}
      </div>
      {progress && (
        <div style={{ marginTop: 2 }}>
          <div
            style={{
              display: "flex",
              height: 5,
              borderRadius: 3,
              overflow: "hidden",
              background: hero ? "rgba(255,255,255,0.12)" : T.paper2,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progress.pct * 100))}%`,
                background: T.coral,
                transition: `width 240ms ${T.ease}`,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 6,
              fontSize: 11,
              color: hero ? "rgba(255,255,255,0.5)" : T.mute,
            }}
          >
            <span>{progress.left}</span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}
      {hint && (
        <div
          style={{
            fontSize: compact ? 10.5 : 12,
            color:
              accent === "coral"
                ? T.coral
                : accent === "amber"
                  ? T.amber
                  : accent === "green"
                    ? T.green
                    : hero
                      ? "rgba(255,255,255,0.64)"
                      : T.mute,
            fontWeight: 400,
            lineHeight: 1.3,
          }}
        >
          {hint}
        </div>
      )}
      {footer && (
        <div
          style={{
            marginTop: 2,
            paddingTop: 10,
            borderTop: `1px solid ${hero ? "rgba(255,255,255,0.14)" : T.line}`,
          }}
        >
          {footer}
        </div>
      )}
    </Card>
  );
}

// ---------- Status dot (animated for live) ----------
export function StatusDot({ status }: { status: string }) {
  const map: Record<string, { c: string; live?: boolean }> = {
    in_progress: { c: T.coral, live: true },
    scheduled: { c: T.blue },
    awaiting: { c: T.amber, live: true },
    final_check: { c: T.amber, live: true },
    completed: { c: T.green },
    cancelled: { c: T.mute },
    block: { c: T.mute },
  };
  const m = map[status] || map.scheduled;
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: m.c,
        flexShrink: 0,
        animation: m.live ? "fx-pulse 1.6s ease-in-out infinite" : "none",
      }}
    />
  );
}

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  awaiting: "Final checks",
  final_check: "Final checks",
  completed: "Completed",
  cancelled: "Cancelled",
  block: "Time blocked",
};

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  width = 560,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fx-modal-backdrop" onClick={onClose}>
      <div
        className="fx-rise fx-modal-panel"
        style={{ ["--fx-modal-width" as string]: `${width}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="fx-modal-header">
            <div className="fx-modal-title">{title}</div>
            <IconButton icon="x" size={30} tone="ghost" onClick={onClose} />
          </div>
        )}
        <div className="fx-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Live indicator (Pulse-style) ----------
export function LiveIndicator({ label = "Live", style }: { label?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: T.mono,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: T.coral,
        ...style,
      }}
    >
      <span className="fx-live-dot" />
      {label}
    </span>
  );
}

// ---------- Field ----------
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: T.slate, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}
