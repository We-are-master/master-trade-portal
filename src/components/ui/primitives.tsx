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
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  size?: "sm" | "md";
}) {
  const sizes = { sm: { w: 28, h: 16, d: 12 }, md: { w: 36, h: 20, d: 16 } } as const;
  const s = sizes[size];
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <button
        type="button"
        onClick={() => onChange && onChange(!on)}
        style={{
          width: s.w,
          height: s.h,
          padding: 2,
          borderRadius: 9999,
          background: on ? T.coral : T.line,
          border: "none",
          cursor: "pointer",
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
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: T.navy }}>{title}</div>
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
  trend,
  style,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "coral" | "amber" | "green";
  hero?: boolean;
  icon?: string;
  trend?: number[];
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      hover={!!onClick}
      style={{
        padding: hero ? 18 : 16,
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
          fontSize: 11.5,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: hero ? "rgba(255,255,255,0.64)" : T.mute,
          fontWeight: 500,
        }}
      >
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div
        style={{
          fontSize: hero ? 34 : 28,
          fontWeight: 600,
          letterSpacing: -0.6,
          color: hero ? T.white : T.navy,
          fontFamily: T.sans,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {trend && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22 }}>
          {trend.map((v, i) => {
            const max = Math.max(...trend);
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${(v / max) * 100}%`,
                  minHeight: 2,
                  borderRadius: 1.5,
                  background: hero ? T.coral : T.coralTint,
                }}
              />
            );
          })}
        </div>
      )}
      {hint && (
        <div
          style={{
            fontSize: 12,
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(2,0,64,0.48)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fx-fade-in 200ms",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fx-rise"
        style={{
          background: T.white,
          borderRadius: 16,
          width,
          maxWidth: "94vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(2,0,64,0.16)",
        }}
      >
        {title !== undefined && (
          <div
            style={{
              padding: "14px 18px",
              borderBottom: `1px solid ${T.line}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.navy }}>{title}</div>
            <IconButton icon="x" size={30} tone="ghost" onClick={onClose} />
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
      </div>
    </div>
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
