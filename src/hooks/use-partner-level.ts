"use client";

// Partner level + monthly goal, derived from the jobs already in context.
//
// Lives in a hook rather than the dashboard because the progress now sits in
// the top bar, which is rendered on every screen — the nudge follows the
// partner around instead of only showing on the dashboard.

import { useMemo } from "react";
import { useMyJobs } from "@/components/jobs-context";
import { londonYmd } from "@/lib/date-range-filter";
import {
  partnerLevelFromProgress,
  resolvePartnerMonthlyGoal,
  type PartnerLevelState,
} from "@/lib/partner-revenue-goal";

/** Days of recent work used to pace the stretch goal — one pay fortnight. */
const PACE_WINDOW_DAYS = 14;

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return londonYmd(d);
}

export function usePartnerLevel(): PartnerLevelState {
  const { jobs } = useMyJobs();

  return useMemo(() => {
    const monthStart = `${londonYmd().slice(0, 7)}-01`;
    const paceStart = daysAgoYmd(PACE_WINDOW_DAYS - 1);

    let monthEarnings = 0;
    let paceEarnings = 0;
    for (const j of jobs) {
      if (j.status !== "completed") continue;
      const done = j.completedDate ?? "";
      if (done >= monthStart) monthEarnings += j.total;
      if (done >= paceStart) paceEarnings += j.total;
    }

    return partnerLevelFromProgress(monthEarnings, resolvePartnerMonthlyGoal(paceEarnings));
  }, [jobs]);
}
