"use client";

import { HelpHint } from "@/components/ui/help-hint";

// Peças do desenho novo do portal (Fixfy OS UNO): cartão, chip de estado,
// quadradinho de ícone colorido, botões e cabeçalho de cartão. Navy é a massa,
// laranja só sinal; cada estado usa o fundo claro com a tinta escura dele.

import type { CSSProperties, ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";

export const UNO = {
  ink2: "#3A3A55",
  ink3: "#6B6B85",
  ink4: "#B4B4C6",
  lineSoft: "#EEEEF5",
  panel2: "#F7F7FB",
  panel3: "#EEEEF5",
  pick: "#F3F3F8",
  nav: "#0A0A28",
  shadowCard: "0 1px 0 0 rgba(10,10,31,0.06), 0 2px 6px -2px rgba(10,10,31,0.10)",
} as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "coral";

export const TONES: Record<Tone, { bg: string; ink: string; base: string }> = {
  ok: { bg: "#D9F3E8", ink: "#054A32", base: "#0E8A5F" },
  warn: { bg: "#FFEFD6", ink: "#573600", base: "#A36500" },
  bad: { bg: "#FDE6EA", ink: "#7D0A1C", base: "#C8102E" },
  info: { bg: "#E7EEFF", ink: "#07379A", base: "#0B5FFF" },
  neutral: { bg: "#EEEEF5", ink: "#3A3A55", base: "#3A3A55" },
  coral: { bg: "#FDEEE6", ink: "#8A2C00", base: "#C23E00" },
};

export function UCard({ children, style, padded = true }: { children: ReactNode; style?: CSSProperties; padded?: boolean }) {
  return (
    <section
      style={{
        background: T.white,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        boxShadow: UNO.shadowCard,
        padding: padded ? 16 : 0,
        overflow: padded ? undefined : "hidden",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function UCardHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${UNO.lineSoft}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{title}</span>
      {action}
    </div>
  );
}

export function UChip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        height: 22,
        padding: "0 8px",
        borderRadius: 6,
        background: t.bg,
        color: t.ink,
        fontSize: 11,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

export function UTile({ tone, icon, size = 36 }: { tone: Tone; icon: string; size?: number }) {
  const t = TONES[tone];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 36 ? 10 : 8,
        background: t.bg,
        color: t.base,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={size >= 36 ? 18 : 16} />
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "white" | "ghost-on-navy";

const BTN: Record<BtnVariant, CSSProperties> = {
  primary: { background: T.navy, color: T.white, border: "1px solid transparent" },
  secondary: { background: T.white, color: T.ink, border: `1px solid ${T.lineStrong}` },
  white: { background: T.white, color: T.navy, border: "1px solid transparent" },
  "ghost-on-navy": { background: "rgba(255,255,255,0.10)", color: T.white, border: "1px solid rgba(255,255,255,0.18)" },
};

export function UButton({
  children,
  icon,
  variant = "primary",
  onClick,
  href,
  height = 36,
  full = false,
  disabled = false,
}: {
  children: ReactNode;
  icon?: string;
  variant?: BtnVariant;
  onClick?: () => void;
  href?: string;
  height?: number;
  full?: boolean;
  disabled?: boolean;
}) {
  const style: CSSProperties = {
    ...BTN[variant],
    height,
    padding: "0 14px",
    borderRadius: 8,
    fontFamily: T.sans,
    fontSize: height >= 40 ? 14 : 13,
    fontWeight: 550,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textDecoration: "none",
    whiteSpace: "nowrap",
    width: full ? "100%" : undefined,
    boxSizing: "border-box",
  };
  const inner = (
    <>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {inner}
    </button>
  );
}

export function ULinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: T.sans, fontSize: 12, color: UNO.ink2 }}
    >
      {children}
    </button>
  );
}

/** Abas em trilho (segmented): a escolhida em navy. */
export function USegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  help,
}: {
  help?: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div
      role="tablist"
      aria-label={label}
      className="fx-keep-grid"
      style={{ display: "flex", gap: 4, padding: 4, background: UNO.panel3, borderRadius: 10, maxWidth: 420 }}
    >
      {options.map((o) => {
        const sel = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              height: 32,
              padding: "0 12px",
              border: "none",
              borderRadius: 8,
              background: sel ? T.navy : "transparent",
              color: sel ? T.white : UNO.ink2,
              fontFamily: T.sans,
              fontSize: 13,
              fontWeight: 550,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
    {help && <HelpHint label={label} text={help} />}
    </div>
  );
}

/** Cabeçalho de página: título à esquerda, ações à direita, na mesma linha. */
export function UViewHead({ title, meta, actions, help }: { title: string; meta?: ReactNode; actions?: ReactNode; help?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", minHeight: 38 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 550, letterSpacing: "-0.03em", color: T.ink }}>{title} {help && <HelpHint label={title} text={help} />}</h1>
        {meta ? <p style={{ margin: "2px 0 0", fontSize: 13, color: UNO.ink3 }}>{meta}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}
