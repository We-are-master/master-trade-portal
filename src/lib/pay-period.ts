/**
 * Fortnight (biweekly) pay-period maths for the partner earnings card.
 *
 * The Fixfy OS is the source of truth: every `self_bills` row carries its own
 * `week_start` / `week_end` window plus a `due_date` (the Friday the money
 * lands). These helpers only fill the gaps — a partner with no self-bill row
 * yet still needs a window to accumulate into, and older rows sometimes have
 * a null `due_date` until the run is generated.
 *
 * Observed in production `self_bills` (Aug 2026):
 *   03 Aug → 16 Aug  (Mon→Sun, 14d)  due Fri 21 Aug
 *   17 Aug → 30 Aug  (Mon→Sun, 14d)  due Fri 04 Sep
 *   31 Aug → 13 Sep  (Mon→Sun, 14d)  due Fri 18 Sep
 * i.e. the period ends on a Sunday and is paid the Friday 5 days later.
 */

import { LONDON_TZ, londonYmd } from "@/lib/date-range-filter";

/** Days between a period's last day (Sunday) and its pay run (Friday). */
export const PAY_RUN_LAG_DAYS = 5;

/**
 * A real fortnight start observed in the OS. Every other Monday from here is a
 * period boundary. Only used when the partner has no self-bill row to anchor on
 * — once the OS issues one, its own window wins.
 */
export const FORTNIGHT_ANCHOR_YMD = "2026-08-03";

export interface PayPeriodWindow {
  /** Inclusive YYYY-MM-DD, a Monday. */
  startYmd: string;
  /** Inclusive YYYY-MM-DD, the Sunday 13 days later. */
  endYmd: string;
}

function ymdToUtc(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`);
}

export function addDays(ymd: string, delta: number): string {
  const d = new Date(ymdToUtc(ymd) + delta * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtc(toYmd) - ymdToUtc(fromYmd)) / 86_400_000);
}

/** The 14-day window containing `ymd`, aligned to {@link FORTNIGHT_ANCHOR_YMD}. */
export function fortnightWindow(ymd: string = londonYmd()): PayPeriodWindow {
  const offset = daysBetween(FORTNIGHT_ANCHOR_YMD, ymd);
  // Floor towards -infinity so dates before the anchor still land on a boundary.
  const periods = Math.floor(offset / 14);
  const startYmd = addDays(FORTNIGHT_ANCHOR_YMD, periods * 14);
  return { startYmd, endYmd: addDays(startYmd, 13) };
}

/** Pay-run date for a period that ends on `endYmd` — the Friday 5 days later. */
export function payRunDateFor(endYmd: string): string {
  return addDays(endYmd, PAY_RUN_LAG_DAYS);
}

/** "17–30 Aug" / "31 Aug – 13 Sep" — compact period label. */
export function formatPeriodRange(startYmd: string, endYmd: string): string {
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  const sameMonth = startYmd.slice(0, 7) === endYmd.slice(0, 7);
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" });
  const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return sameMonth ? `${day(start)}–${dayMonth(end)}` : `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** "Fri 4 Sep" — pay-run date label. */
export function formatPayRunDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Every YYYY-MM-DD in the window, oldest first — one bar per day in the trend. */
export function windowDays(win: PayPeriodWindow): string[] {
  const total = daysBetween(win.startYmd, win.endYmd) + 1;
  return Array.from({ length: total }, (_, i) => addDays(win.startYmd, i));
}

export { LONDON_TZ };
