// Maps Fixfy OS `self_bills` rows → the fortnight the partner is currently
// earning into, and the next pay run they are owed.
//
// The OS writes one self-bill per partner per period with its own window
// (`week_start`/`week_end`), a `payment_cadence` and a `due_date` — the Friday
// the money lands. We read those rather than recomputing a calendar, so a
// partner on a shifted cycle still sees their real dates.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FORTNIGHT_ANCHOR_YMD, daysBetween, fortnightWindow, payRunDateFor, type PayPeriodWindow } from "@/lib/pay-period";
import { londonYmd } from "@/lib/date-range-filter";
import { isDemoMode } from "@/lib/demo/demo-mode";
import { demoPayPeriodRows } from "@/lib/demo/demo-data";

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


/** Pay-run date for a row: the OS value when set, else derived from the window. */
function rowPayRunYmd(row: PayPeriodRow): string | null {
  if (row.due_date) return row.due_date.slice(0, 10);
  if (row.week_end) return payRunDateFor(row.week_end);
  return null;
}

export function buildPayPeriodSummary(rows: PayPeriodRow[], todayYmd: string = londonYmd()): PayPeriodSummary {
  const usable = rows.filter((r) => r.week_start && r.week_end);

  // ---- Running period -------------------------------------------------
  // Only an `accumulating` row may define the period the partner is earning
  // into. Anything else is a closed run, and adopting it as "running" makes the
  // card announce a window the partner has not reached yet.
  //
  // The OS also carries off-grid duplicates: rows shifted by a week, with no
  // due_date, usually cancelled or empty. Every genuine biweekly period sits on
  // the 14-day grid (corroborated by the due_dates, which step 21 Aug → 4 Sept →
  // 18 Sept), so a biweekly row that misses the grid is rejected. Weekly and
  // monthly partners legitimately sit off it, and are taken at face value.
  const openRow = usable.find(
    (r) => OPEN.has(r.status ?? "") && r.week_start! <= todayYmd && todayYmd <= r.week_end!,
  );

  const acceptsOpenRow = (() => {
    if (!openRow) return false;
    const span = daysBetween(openRow.week_start!, openRow.week_end!) + 1;
    const biweekly = openRow.payment_cadence === "biweekly" || (span >= 13 && span <= 15);
    if (!biweekly) return true;
    return daysBetween(FORTNIGHT_ANCHOR_YMD, openRow.week_start!) % 14 === 0;
  })();

  let current: RunningPeriod;
  if (openRow && acceptsOpenRow) {
    const startYmd = openRow.week_start!;
    const endYmd = openRow.week_end!;
    current = {
      startYmd,
      endYmd,
      osNet: openRow.net_payout ?? null,
      payRunYmd: rowPayRunYmd(openRow) ?? payRunDateFor(endYmd),
      fromOs: true,
      cadence: cadenceFor(startYmd, endYmd),
    };
  } else {
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
