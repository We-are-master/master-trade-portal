"use client";

// Icon — Lucide wrapper exposing the prototype's `<Icon name="kebab-case" />` API.
// The design used the Lucide CDN (`data-lucide`); here we resolve the React component
// from lucide-react's registry. An alias map covers icons renamed across versions, and
// any unknown name falls back to a Circle so the UI never crashes on a bad name.

import { icons } from "lucide-react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

const REGISTRY = icons as unknown as Record<string, LucideIcon>;

// kebab-case -> current lucide PascalCase, for names that were renamed.
const ALIASES: Record<string, string> = {
  "check-circle-2": "CircleCheckBig",
  "x-circle": "CircleX",
  "alert-triangle": "TriangleAlert",
  "octagon-alert": "OctagonAlert",
  "check-square": "SquareCheckBig",
  "play-circle": "CirclePlay",
  "loader-2": "LoaderCircle",
  "more-vertical": "EllipsisVertical",
  "more-horizontal": "Ellipsis",
};

function toPascal(name: string): string {
  return name
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
}

function resolve(name: string): LucideIcon {
  const aliased = ALIASES[name];
  if (aliased && REGISTRY[aliased]) return REGISTRY[aliased];
  const pascal = toPascal(name);
  if (REGISTRY[pascal]) return REGISTRY[pascal];
  return REGISTRY.Circle;
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, color = "currentColor", className, style }: IconProps) {
  const Cmp = resolve(name);
  return (
    <Cmp
      size={size}
      color={color}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    />
  );
}
