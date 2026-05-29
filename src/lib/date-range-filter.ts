/**
 * Date filter primitives — aligned with Fixfy OS Pulse (Today / Tomorrow / Week / Month / Custom).
 * Bounds are inclusive YYYY-MM-DD in Europe/London to match job `scheduled_date` / `completed_date`.
 */

import type { MyJob } from "@/types";

export const LONDON_TZ = "Europe/London";

export type DateFilterMode = "all" | "today" | "tomorrow" | "week" | "month" | "custom";

export type DateFilterValue = {
  mode: DateFilterMode;
  customFrom?: string;
  customTo?: string;
};

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  mode: "today",
  customFrom: "",
  customTo: "",
};

export type DateFilterYmdBounds = { fromYmd: string; toYmd: string };

export const DATE_FILTER_QUICK_OPTIONS: { id: Exclude<DateFilterMode, "custom">; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

export function londonYmd(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: LONDON_TZ });
}

function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, day] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  dt.setDate(dt.getDate() + delta);
  return londonYmd(dt);
}

function startOfIsoWeekYmd(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  const dow = dt.getDay() || 7;
  dt.setDate(dt.getDate() - (dow - 1));
  return londonYmd(dt);
}

export function resolveDateFilterYmd(value: DateFilterValue): DateFilterYmdBounds | null {
  if (value.mode === "all") return null;

  const today = londonYmd();

  switch (value.mode) {
    case "today":
      return { fromYmd: today, toYmd: today };
    case "tomorrow": {
      const t = addDaysToYmd(today, 1);
      return { fromYmd: t, toYmd: t };
    }
    case "week": {
      const fromYmd = startOfIsoWeekYmd(today);
      return { fromYmd, toYmd: addDaysToYmd(fromYmd, 6) };
    }
    case "month": {
      const [y, m] = today.split("-").map(Number);
      const fromYmd = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const toYmd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return { fromYmd, toYmd };
    }
    case "custom": {
      const fromYmd = value.customFrom?.trim();
      const toYmd = value.customTo?.trim();
      if (!fromYmd || !toYmd) return null;
      return { fromYmd, toYmd: toYmd };
    }
  }
}

export function dateFilterLabel(value: DateFilterValue): string {
  if (value.mode === "all") return "All time";
  if (value.mode === "custom") {
    const bounds = resolveDateFilterYmd(value);
    if (!bounds) return "Custom range";
    const fmt = (ymd: string) =>
      new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: LONDON_TZ,
      });
    return `${fmt(bounds.fromYmd)} – ${fmt(bounds.toYmd)}`;
  }
  return DATE_FILTER_QUICK_OPTIONS.find((o) => o.id === value.mode)?.label ?? "";
}

/** Primary civil date used when filtering a job row. */
export function jobFilterYmd(job: MyJob): string {
  if (job.status === "completed" && job.completedDate) return job.completedDate;
  if (job.status === "cancelled" && job.completedDate) return job.completedDate;
  return job.scheduledDate ?? "";
}

export function jobMatchesDateFilter(job: MyJob, value: DateFilterValue): boolean {
  if (value.mode === "all") return true;
  const bounds = resolveDateFilterYmd(value);
  if (!bounds) return false;
  const ymd = jobFilterYmd(job);
  if (!ymd) return false;
  return ymd >= bounds.fromYmd && ymd <= bounds.toYmd;
}

export function ymdInBounds(ymd: string, bounds: DateFilterYmdBounds): boolean {
  return ymd >= bounds.fromYmd && ymd <= bounds.toYmd;
}
