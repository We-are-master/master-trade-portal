// Maps Fixfy OS `self_bills` rows → the fortnight the partner is currently
// earning into, and the next pay run they are owed.
//
// The OS writes one self-bill per partner per period with its own window
// (`week_start`/`week_end`), a `payment_cadence` and a `due_date` — the Friday
// the money lands. We read those rather than recomputing a calendar, so a
// partner on a shifted cycle still sees their real dates.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FORTNIGHT_ANCHOR_YMD, daysBetween, fortnightWindow, payRunDateFor, type PayPeriodWindow } from "@/lib/pay-period";
import { isDemoMode } from "@/lib/demo/demo-mode";
import { demoPayPeriodRows } from "@/lib/demo/demo-data";
import { londonYmd } from "@/lib/date-range-filter";

export const PAY_PERIOD_SELECT = [
  "week_start",
  "week_end",
  "payment_cadence",
  "due_date",
  "status",
  "net_payout",
  "jobs_count",
].join(",");

export interface PayPeriodRow {
  week_start: string | null;
  week_end: string | null;
  payment_cadence: string | null;
  due_date: string | null;
  status: string | null;
  net_payout: number | null;
  jobs_count: number | null;
}

/** Money already left Fixfy — nothing left to show as owed. */
const SETTLED = new Set(["paid", "payment_sent"]);
/** Never going to be paid — must not inflate the next pay run. */
const VOID = new Set(["payout_cancelled", "payout_lost", "payout_archived", "rejected"]);
/** Still filling up — this is the running period, not a closed one. */
const OPEN = new Set(["accumulating"]);

export type PeriodCadence = "week" | "fortnight" | "month";

export interface RunningPeriod extends PayPeriodWindow {
  /**
   * Net payout the OS has accrued so far. Null when there is no self-bill yet,
   * or when the bill for this window is already closed into a pay run — in that
   * case the money belongs to `pending` and the caller falls back to job totals
   * so the same figure is never shown twice.
   */
  osNet: number | null;
  /** Friday this period gets paid. */
  payRunYmd: string;
  /** True when the window came from a real self_bills row. */
  fromOs: boolean;
  /** Period length, so the UI can label a weekly or monthly partner correctly. */
  cadence: PeriodCadence;
}

export function cadenceFor(startYmd: string, endYmd: string): PeriodCadence {
  const span = daysBetween(startYmd, endYmd) + 1;
  if (span <= 8) return "week";
  if (span <= 17) return "fortnight";
  return "month";
}

export interface PendingPayRun {
  /** Friday the money lands. */
  payRunYmd: string;
  /** Sum of net_payout across the closed self-bills in this run. */
  net: number;
  /** Number of self-bills rolled into the run. */
  bills: number;
  /** Earliest period start and latest period end across those bills. */
  startYmd: string;
  endYmd: string;
}

export interface PayPeriodSummary {
  current: RunningPeriod;
  /** Closed but unpaid — what the partner is owed next. Null when nothing is due. */
  pending: PendingPayRun | null;
}

/**
 * Is this row on the partner's real pay cycle?
 *
 * The OS carries off-grid duplicates: biweekly rows shifted by a week, with no
 * `due_date`, usually cancelled or empty. Every genuine fortnight sits on the
 * 14-day grid — corroborated by the OS's own due_dates, which step 21 Aug →
 * 4 Sept → 18 Sept. Weekly and monthly partners legitimately sit off that grid,
 * so the check only applies to biweekly rows.
 */
function isOnCycle(row: PayPeriodRow): boolean {
  if (!row.week_start || !row.week_end) return false;
  const span = daysBetween(row.week_start, row.week_end) + 1;
  const biweekly = row.payment_cadence === "biweekly" || (span >= 13 && span <= 15);
  if (!biweekly) return true;
  return daysBetween(FORTNIGHT_ANCHOR_YMD, row.week_start) % 14 === 0;
}

/** Pay-run date for a row: the OS value when set, else derived from the window. */
function rowPayRunYmd(row: PayPeriodRow): string | null {
  if (row.due_date) return row.due_date.slice(0, 10);
  if (row.week_end) return payRunDateFor(row.week_end);
  return null;
}

/**
 * Which self-bill is "the period I am earning into" when several cover today.
 *
 * The OS can leave more than one row open over the same days: an empty
 * `accumulating` shell next to the row that actually holds the work. Preferring
 * `accumulating` alone picked the empty one and the card read £0 while the
 * partner was owed £950, so money comes first among open rows.
 *
 * The old comparator also returned a constant when two windows were the same
 * length, which is not a valid ordering — the winner depended on the order rows
 * came back from the database, so the same partner could see different totals
 * between loads. Every step below is a total order, ending on `week_start` so
 * the result is stable whatever the input order.
 */
export function compareRunningCandidates(a: PayPeriodRow, b: PayPeriodRow): number {
  const openDiff = Number(OPEN.has(b.status ?? "")) - Number(OPEN.has(a.status ?? ""));
  if (openDiff !== 0) return openDiff;

  // Among rows in the same state, the one carrying work describes the period.
  const moneyDiff = Number((b.net_payout ?? 0) > 0) - Number((a.net_payout ?? 0) > 0);
  if (moneyDiff !== 0) return moneyDiff;

  const spanDiff = daysBetween(b.week_start!, b.week_end!) - daysBetween(a.week_start!, a.week_end!);
  if (spanDiff !== 0) return spanDiff;

  // Last resort, so the order never depends on how the rows arrived.
  return a.week_start!.localeCompare(b.week_start!);
}

export function buildPayPeriodSummary(rows: PayPeriodRow[], todayYmd: string = londonYmd()): PayPeriodSummary {
  const usable = rows.filter((r) => r.week_start && r.week_end);

  // ---- Running period -------------------------------------------------
  // Only an `accumulating` row may describe the period the partner is earning
  // into. A closed run also covers today, and adopting one made the card
  // announce a window that has not started yet ("Day 2 of 14" mid-fortnight).
  const containingToday = usable
    .filter(
      (r) =>
        r.week_start! <= todayYmd &&
        todayYmd <= r.week_end! &&
        !VOID.has(r.status ?? "") &&
        OPEN.has(r.status ?? "") &&
        isOnCycle(r),
    )
    .sort(compareRunningCandidates)[0];

  let current: RunningPeriod;
  if (containingToday) {
    const startYmd = containingToday.week_start!;
    const endYmd = containingToday.week_end!;
    current = {
      startYmd,
      endYmd,
      osNet: containingToday.net_payout ?? null,
      payRunYmd: rowPayRunYmd(containingToday) ?? payRunDateFor(endYmd),
      fromOs: true,
      cadence: cadenceFor(startYmd, endYmd),
    };
  } else {
    // Nothing credible to anchor on — use the standard grid. Re-anchoring on the
    // partner's latest row was worse than useless here: their history is often
    // weekly, and stepping 14 days from a weekly start lands off-cycle.
    const win = fortnightWindow(todayYmd);
    current = {
      ...win,
      osNet: null,
      payRunYmd: payRunDateFor(win.endYmd),
      fromOs: false,
      cadence: cadenceFor(win.startYmd, win.endYmd),
    };
  }

  // ---- Next pay run ---------------------------------------------------
  // Closed periods the partner is still owed, grouped by the date they pay out.
  // A bill is owed once the OS raises the run (awaiting_payment and friends,
  // which can happen before the window ends) OR once its window has simply run
  // out — a period that closed on Sunday is money the partner is due, even if
  // the OS has not flipped it off `accumulating` yet.
  const owed = usable.filter((r) => {
    const status = r.status ?? "";
    if (SETTLED.has(status) || VOID.has(status)) return false;
    if (OPEN.has(status)) return r.week_end! < todayYmd;
    return true;
  });

  const byRun = new Map<string, PayPeriodRow[]>();
  for (const row of owed) {
    const ymd = rowPayRunYmd(row);
    if (!ymd) continue;
    const bucket = byRun.get(ymd);
    if (bucket) bucket.push(row);
    else byRun.set(ymd, [row]);
  }

  // The run the partner sees next: the soonest that has not happened yet,
  // falling back to the most recent overdue one so money never disappears.
  const runDates = [...byRun.keys()].sort();
  const upcoming = runDates.find((ymd) => ymd >= todayYmd) ?? runDates[runDates.length - 1];

  let pending: PendingPayRun | null = null;
  if (upcoming) {
    const bills = byRun.get(upcoming)!;
    const net = bills.reduce((sum, r) => sum + (r.net_payout ?? 0), 0);
    if (net > 0) {
      pending = {
        payRunYmd: upcoming,
        net,
        bills: bills.length,
        startYmd: bills.reduce((min, r) => (r.week_start! < min ? r.week_start! : min), bills[0].week_start!),
        endYmd: bills.reduce((max, r) => (r.week_end! > max ? r.week_end! : max), bills[0].week_end!),
      };
    }
  }

  return { current, pending };
}

export async function fetchPayPeriodSummary(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<PayPeriodSummary> {
  if (isDemoMode()) return buildPayPeriodSummary(demoPayPeriodRows());
  const { data, error } = await supabase
    .from("self_bills")
    .select(PAY_PERIOD_SELECT)
    .eq("partner_id", partnerId)
    .order("week_start", { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw error;
  return buildPayPeriodSummary((data as unknown as PayPeriodRow[]) ?? []);
}
