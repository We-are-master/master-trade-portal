"use client";

// Dashboard — greeting, KPI strip, today's schedule, activity feed, mini cards.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Button, Card, Icon, IconButton, LiveIndicator, StatCard, StatusDot } from "@/components/ui/primitives";
import { formatGBP } from "@/lib/format";
import { jobMatchesDateFilter, londonYmd } from "@/lib/date-range-filter";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { PartnerRatingCard } from "@/components/ui/partner-rating";
import { usePartner } from "@/components/partner-context";
import { usePartnerRating } from "@/hooks/use-partner-rating";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import { fetchAvailableJobs } from "@/lib/queries/available-jobs";
import { fetchAvailableQuotes } from "@/lib/queries/quotes";
import { PartnerLevelGoal } from "@/components/ui/partner-level-goal";
import { resolvePartnerMonthlyGoal, revenueGoalProgress } from "@/lib/partner-revenue-goal";
import type { ActivityTone, AvailableJob, MyJob, QuoteRequest } from "@/types";

const OPPORTUNITY_POLL_MS = 30_000;

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return londonYmd(d);
}

function londonMonthStartYmd(): string {
  const ymd = londonYmd(new Date());
  return `${ymd.slice(0, 7)}-01`;
}

function relativeWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

interface PortalLead {
  offerId: string;
  status: string;
  title: string;
  budget: number | null;
  posted: string | null;
}

interface DerivedActivity {
  id: string;
  icon: string;
  tone: ActivityTone;
  text: string;
  meta?: string;
  when: string;
  sortKey: string;
}

interface OpportunitySnapshot {
  leads: PortalLead[];
  jobs: AvailableJob[];
  quotes: QuoteRequest[];
  loaded: boolean;
}

function weekCompareLabel(thisWeek: number, lastWeek: number): { text: string; tone: "green" | "coral" | "mute" } {
  if (lastWeek === 0 && thisWeek === 0) return { text: "Flat vs last week", tone: "mute" };
  if (lastWeek === 0) return { text: `+${formatGBP(thisWeek)} vs last week`, tone: "green" };
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (pct === 0) return { text: "Flat vs last week", tone: "mute" };
  if (pct > 0) return { text: `+${pct}% vs last week`, tone: "green" };
  return { text: `${pct}% vs last week`, tone: "coral" };
}

function greetingWord(): string {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export function Dashboard({
  onOpenJob,
  onNav,
  previewMode = false,
}: {
  onOpenJob: (id: string) => void;
  onNav: (route: string) => void;
  previewMode?: boolean;
}) {
  const partner = usePartner();
  const { rating, complaintCount, pointsLost, topComplaints, loaded: ratingLoaded } = usePartnerRating(partner.rating);
  const { jobs, loading, error, refresh } = useMyJobs();
  const { value: dateFilter, setValue: setDateFilter, label: dateFilterLabel } = useDateRangeFilter();

  const [docs, setDocs] = useState<PartnerDoc[] | null>(null);
  const [trialDays, setTrialDays] = useState<number>(partner.trialDaysLeft);
  const [opps, setOpps] = useState<OpportunitySnapshot>({ leads: [], jobs: [], quotes: [], loaded: false });
  const [pulseTick, setPulseTick] = useState(0);

  const loadOpportunities = useCallback(async () => {
    try {
      const supabase = createClient();
      const [leadsRes, availJobs, quotes] = await Promise.all([
        fetch("/api/leads")
          .then((r) => r.json())
          .catch(() => ({ leads: [] as PortalLead[] })),
        fetchAvailableJobs(supabase, partner.id).catch(() => [] as AvailableJob[]),
        fetchAvailableQuotes(supabase, partner.id).catch(() => [] as QuoteRequest[]),
      ]);
      setOpps({
        leads: (leadsRes.leads ?? []) as PortalLead[],
        jobs: availJobs,
        quotes: quotes.filter((q) => q.status === "to-quote"),
        loaded: true,
      });
      setPulseTick(Date.now());
    } catch {
      setOpps((prev) => ({ ...prev, loaded: true }));
    }
  }, [partner.id]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const rows = await fetchPartnerDocuments(supabase, partner.id);
        if (!cancelled) setDocs(rows);
      } catch {
        /* keep null */
      }
      try {
        const { data } = await supabase.from("partners").select("trial_ends_at").eq("id", partner.id).maybeSingle();
        const iso = (data as { trial_ends_at?: string | null } | null)?.trial_ends_at;
        if (!cancelled && iso) {
          const ms = new Date(iso).getTime() - Date.now();
          setTrialDays(ms > 0 ? Math.ceil(ms / 86_400_000) : 0);
        }
      } catch {
        /* mig 196 not applied */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  useEffect(() => {
    void loadOpportunities();
    if (previewMode) return;
    const id = window.setInterval(() => void loadOpportunities(), OPPORTUNITY_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadOpportunities, previewMode]);

  const docSummary = useMemo(() => {
    if (!docs) return null;
    const verified = docs.filter((x) => x.status === "verified").length;
    const expiringSoon = docs.find((x) => x.warning);
    return { total: docs.length, verified, expiringSoon };
  }, [docs]);

  const d = useMemo(() => {
    const today = londonYmd();
    const monthStart = londonMonthStartYmd();
    const filteredJobs = jobs.filter((j) => jobMatchesDateFilter(j, dateFilter));
    const scheduleJobs = filteredJobs
      .filter((j) => j.status !== "completed" && j.status !== "cancelled")
      .sort((a, b) => (a.scheduled ?? "").localeCompare(b.scheduled ?? ""));

    const trendDays = Array.from({ length: 7 }, (_, i) => daysAgoYmd(6 - i));
    const trend = trendDays.map((day) =>
      jobs.filter((j) => j.status === "completed" && j.completedDate === day).reduce((s, j) => s + j.total, 0),
    );
    const weekEarnings = trend.reduce((s, n) => s + n, 0);
    const prevTrendDays = Array.from({ length: 7 }, (_, i) => daysAgoYmd(13 - i));
    const prevTrend = prevTrendDays.map((day) =>
      jobs.filter((j) => j.status === "completed" && j.completedDate === day).reduce((s, j) => s + j.total, 0),
    );
    const lastWeekEarnings = prevTrend.reduce((s, n) => s + n, 0);
    const monthEarnings = jobs
      .filter((j) => j.status === "completed" && (j.completedDate ?? "") >= monthStart)
      .reduce((s, j) => s + j.total, 0);

    const active = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress");
    const awaiting = jobs.filter((j) => j.status === "final_check");
    const since30 = daysAgoYmd(30);
    const completed30 = jobs.filter((j) => j.status === "completed" && (j.completedDate ?? "") >= since30);
    const pendingPayout = awaiting.reduce((s, j) => s + j.total, 0);
    const scheduleTotal = scheduleJobs.reduce((s, j) => s + j.total, 0);
    const inProgress = jobs.find((j) => j.status === "in_progress");
    const monthGoal = resolvePartnerMonthlyGoal(weekEarnings);
    const goal = revenueGoalProgress(monthEarnings, monthGoal);

    return {
      today,
      scheduleJobs,
      trend,
      weekEarnings,
      lastWeekEarnings,
      prevTrend,
      monthEarnings,
      monthGoal,
      goal,
      active,
      awaiting,
      completed30,
      pendingPayout,
      scheduleTotal,
      inProgress,
      filteredCount: filteredJobs.length,
    };
  }, [jobs, dateFilter]);

  const oppStats = useMemo(() => {
    const newLeads = opps.leads.filter((l) => l.status !== "contacted").length;
    const leadValue = opps.leads.reduce((s, l) => s + (l.budget ?? 0), 0);
    const jobValue = opps.jobs.reduce((s, j) => s + j.total, 0);
    const quoteValue = 0;
    return {
      newLeads,
      leadValue,
      jobValue,
      quoteValue,
      totalLive: opps.leads.length + opps.jobs.length + opps.quotes.length,
    };
  }, [opps]);

  const pulseFeed = useMemo<DerivedActivity[]>(() => {
    const items: DerivedActivity[] = [];

    for (const l of opps.leads.slice(0, 4)) {
      items.push({
        id: `lead-${l.offerId}`,
        icon: "user-plus",
        tone: l.status === "contacted" ? "green" : "coral",
        text: l.status === "contacted" ? `Lead contacted — ${l.title}` : `New lead — ${l.title}`,
        meta: l.budget != null ? `${formatGBP(l.budget)} · ${l.status === "contacted" ? "done" : "act now"}` : "Hot enquiry",
        when: relativeWhen(l.posted),
        sortKey: l.posted ?? "",
      });
    }
    for (const j of opps.jobs.slice(0, 4)) {
      items.push({
        id: `avail-${j.id}`,
        icon: "zap",
        tone: "coral",
        text: `Job up for grabs — ${j.title}`,
        meta: `${formatGBP(j.total)} · first to accept wins`,
        when: j.timing,
        sortKey: j.id,
      });
    }
    for (const q of opps.quotes.slice(0, 4)) {
      items.push({
        id: `quote-${q.id}`,
        icon: "file-text",
        tone: "amber",
        text: `Quote to submit — ${q.title}`,
        meta: q.yourBid != null ? `Your bid ${formatGBP(q.yourBid)} · due ${q.deadline}` : `Due ${q.deadline}`,
        when: q.deadline,
        sortKey: q.id,
      });
    }

    for (const j of jobs) {
      if (!jobMatchesDateFilter(j, dateFilter)) continue;
      if (j.status === "completed" && j.completedDate) {
        items.push({
          id: `c-${j.id}`,
          icon: "circle-check",
          tone: "green",
          text: `Completed ${j.title}`,
          meta: `${j.customer.name} · ${formatGBP(j.total)}`,
          when: j.completed ?? "",
          sortKey: j.completedDate,
        });
      } else if (j.status === "final_check") {
        items.push({
          id: `a-${j.id}`,
          icon: "clock",
          tone: "amber",
          text: `Final checks — ${j.title}`,
          meta: `${j.customer.name} · ${formatGBP(j.total)}`,
          when: j.scheduled ?? "",
          sortKey: j.scheduledDate ?? "9999",
        });
      } else if (j.status === "scheduled" && j.scheduledDate) {
        items.push({
          id: `s-${j.id}`,
          icon: "calendar",
          tone: "navy",
          text: `Scheduled ${j.title}`,
          meta: `${j.customer.name} · ${j.postcode}`,
          when: j.scheduled ?? "",
          sortKey: j.scheduledDate,
        });
      }
    }

    return items.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).slice(0, 8);
  }, [jobs, dateFilter, opps]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: T.mute, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="loader" size={16} color={T.mute} /> Loading your dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 14, color: T.ink }}>Couldn&apos;t load your jobs: {error}</div>
        <Button variant="secondary" size="sm" icon="refresh-cw" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

  const scheduleTitle =
    dateFilter.mode === "today"
      ? "Today's schedule"
      : dateFilter.mode === "tomorrow"
        ? "Tomorrow's schedule"
        : `Schedule · ${dateFilterLabel.toLowerCase()}`;

  const weekCompare = weekCompareLabel(d.weekEarnings, d.lastWeekEarnings);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1, overflow: "auto" }}>
      {/* Greeting + date filter */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, color: T.navy }}>
            {greetingWord()}, {partner.firstName}.
          </div>
          <div style={{ fontSize: 14, color: T.slate, marginTop: 4 }}>
            <span style={{ color: T.coral, fontWeight: 500 }}>
              {d.scheduleJobs.length} {d.scheduleJobs.length === 1 ? "job" : "jobs"}
            </span>{" "}
            · {dateFilterLabel.toLowerCase()} · {d.active.length} active
            {trialDays > 0 && (
              <>
                {" "}·{" "}
                <span className="fx-mono" style={{ color: T.amber }}>
                  {trialDays} day{trialDays === 1 ? "" : "s"}
                </span>{" "}
                left on trial
              </>
            )}
            .
          </div>
        </div>
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
        {d.inProgress && (
          <Button variant="dark" icon="play" onClick={() => onOpenJob(d.inProgress!.id)}>
            Resume current job
          </Button>
        )}
      </div>

      {/* KPI strip — sticky on scroll */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingBottom: 4,
          background: T.paper,
          margin: "-4px -4px 0",
          padding: "4px 4px 8px",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 12 }}>
          <StatCard
            hero
            label="This week's earnings"
            value={formatGBP(d.weekEarnings)}
            hint="Completed · last 7 days"
            trend={d.trend}
            compare={weekCompare}
            prevTrend={d.prevTrend}
          />
          <StatCard
            label="Active jobs"
            value={d.active.length}
            hint="Scheduled + in progress"
            icon="briefcase"
            onClick={() => onNav("jobs")}
          />
          <StatCard
            label="Final checks"
            value={d.awaiting.length}
            hint={d.pendingPayout > 0 ? `${formatGBP(d.pendingPayout)} pending` : "Nothing pending"}
            accent="coral"
            icon="clock"
            onClick={() => onNav("jobs")}
          />
          <StatCard
            label="Completed"
            value={d.completed30.length}
            hint="Last 30 days"
            icon="circle-check"
            onClick={() => onNav("jobs")}
          />
        </div>

        {/* Gamified strip: month goal + live opportunities */}
        <Card style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <PartnerLevelGoal earned={d.monthEarnings} goal={d.goal.goal} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <LiveIndicator label="Live" />
            <OppPill icon="user-plus" label="Leads" count={opps.leads.length} hot={oppStats.newLeads > 0} tone="coral" onClick={() => onNav("leads")} />
            <OppPill icon="zap" label="Jobs" count={opps.jobs.length} hot={opps.jobs.length > 0} tone="navy" onClick={() => onNav("available")} />
            <OppPill icon="file-text" label="Quotes" count={opps.quotes.length} hot={opps.quotes.length > 0} tone="amber" onClick={() => onNav("quotes")} />
            <IconButton icon="refresh-cw" size={28} tone="ghost" onClick={() => void loadOpportunities()} />
          </div>
        </Card>
      </div>

      {trialDays > 0 && (
        <Card
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderColor: T.amber50,
            background: "linear-gradient(0deg, rgba(196,122,0,0.04), rgba(196,122,0,0.04)), #fff",
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, background: T.amber50, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="zap" size={16} color={T.amber} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>
              You&apos;ve earned{" "}
              <span className="fx-mono" style={{ color: T.amber }}>
                {formatGBP(d.weekEarnings)}
              </span>{" "}
              this week on trial. £99/mo keeps it flowing.
            </div>
            <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
              That&apos;s <b>0% commission</b> on your completed work. {trialDays} day{trialDays === 1 ? "" : "s"} left on your trial.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNav("settings:billing")}>
            Review plan
          </Button>
        </Card>
      )}

      {/* Two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.navy }}>{scheduleTitle}</div>
              <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                {dateFilter.mode === "today" ? todayLabel : dateFilterLabel}
              </div>
            </div>
            <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => onNav("schedule")}>
              Open calendar
            </Button>
          </div>
          <div>
            {d.scheduleJobs.map((j, i) => (
              <ScheduleRow key={j.id} job={j} onClick={() => onOpenJob(j.id)} divider={i < d.scheduleJobs.length - 1} />
            ))}
            {d.scheduleJobs.length === 0 && (
              <div style={{ padding: 24, color: T.mute, fontSize: 13, textAlign: "center" }}>
                {dateFilter.mode === "today"
                  ? "Free day. Maybe a coffee on Northcote Road."
                  : `No jobs scheduled for ${dateFilterLabel.toLowerCase()}.`}
              </div>
            )}
            {d.scheduleJobs.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderTop: `1px solid ${T.line}`,
                  background: T.paper,
                }}
              >
                <Icon name="briefcase" size={14} color={T.mute} />
                <span style={{ fontSize: 12, color: T.mute }}>
                  <b style={{ color: T.ink, fontWeight: 500 }}>
                    {d.scheduleJobs.length} {d.scheduleJobs.length === 1 ? "job" : "jobs"}
                  </b>{" "}
                  · {formatGBP(d.scheduleTotal)}
                </span>
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ratingLoaded && (
            <PartnerRatingCard
              rating={rating}
              complaintCount={complaintCount}
              pointsLost={pointsLost}
              topComplaints={topComplaints}
              compact
            />
          )}
        <Card>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.navy }}>Activity</div>
            <LiveIndicator />
            {pulseTick > 0 && (
              <span style={{ fontSize: 10.5, color: T.mute, fontFamily: T.mono, marginLeft: 8 }}>
                {relativeWhen(new Date(pulseTick).toISOString())}
              </span>
            )}
          </div>
          <div>
            {pulseFeed.map((a, i) => (
              <ActivityRow key={a.id} a={a} divider={i < pulseFeed.length - 1} />
            ))}
            {pulseFeed.length === 0 && (
              <div style={{ padding: 24, color: T.mute, fontSize: 13, textAlign: "center" }}>
                No recent activity yet.
              </div>
            )}
          </div>
        </Card>
        </div>
      </div>

      {/* Footer mini cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MiniCard
          icon="map-pin"
          tone="navy"
          title="Your service area"
          line1={`${partner.postcode || "Set your area"} · ${partner.radiusMiles} mi radius`}
          line2={`${d.active.length} active ${d.active.length === 1 ? "job" : "jobs"} in your patch`}
          cta="Edit area"
          onCta={() => onNav("settings:area")}
        />
        <MiniCard
          icon="shield-check"
          tone={docSummary && docSummary.total > 0 && docSummary.verified === docSummary.total ? "green" : "amber"}
          title="Compliance documents"
          line1={
            !docSummary
              ? "Loading documents…"
              : docSummary.total === 0
                ? "No documents on file yet"
                : `${docSummary.verified} of ${docSummary.total} verified`
          }
          line2={
            !docSummary
              ? ""
              : docSummary.expiringSoon
                ? `${docSummary.expiringSoon.name}: ${docSummary.expiringSoon.warning}`
                : docSummary.total === 0
                  ? "Upload insurance & certs to unlock work"
                  : "All documents up to date"
          }
          cta="Manage docs"
          onCta={() => onNav("settings:docs")}
        />
        <MiniCard
          icon="receipt"
          tone="amber"
          title="Pending payout"
          line1={d.pendingPayout > 0 ? `${formatGBP(d.pendingPayout)} awaiting sign-off` : "Nothing pending"}
          line2={`From ${d.awaiting.length} ${d.awaiting.length === 1 ? "job" : "jobs"} in final checks`}
          cta="View self-bills"
          onCta={() => onNav("settings:selfbill")}
        />
      </div>
    </div>
  );
}

function OppPill({
  icon,
  label,
  count,
  hot,
  tone,
  onClick,
}: {
  icon: string;
  label: string;
  count: number;
  hot?: boolean;
  tone: "coral" | "navy" | "amber";
  onClick: () => void;
}) {
  const toneMap = {
    coral: { bg: T.coralTint, fg: T.coral, border: "rgba(237,75,0,0.25)" },
    navy: { bg: T.paper2, fg: T.navy, border: T.line },
    amber: { bg: T.amber50, fg: T.amber, border: "rgba(196,122,0,0.25)" },
  } as const;
  const t = toneMap[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 9999,
        border: `1px solid ${hot ? t.border : T.line}`,
        background: hot ? t.bg : T.white,
        cursor: "pointer",
        fontFamily: T.sans,
      }}
    >
      {hot && <span className="fx-live-dot" />}
      <Icon name={icon} size={14} color={t.fg} />
      <span style={{ fontSize: 12.5, fontWeight: 500, color: T.ink }}>{label}</span>
      <span
        style={{
          minWidth: 20,
          height: 20,
          padding: "0 6px",
          borderRadius: 9999,
          background: count > 0 ? t.fg : T.paper2,
          color: count > 0 ? T.white : T.mute,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: T.mono,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function ScheduleRow({ job, onClick, divider }: { job: MyJob; onClick: () => void; divider: boolean }) {
  const [h, setH] = useState(false);
  const time = job.scheduled ? job.scheduled.split(", ")[1]?.split("–")[0] ?? "" : "";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr auto",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        cursor: "pointer",
        background: h ? "rgba(2,0,64,0.03)" : "transparent",
        borderBottom: divider ? `1px solid ${T.line}` : "none",
        transition: `background 120ms ${T.ease}`,
      }}
    >
      <div className="fx-mono" style={{ fontSize: 12, color: T.slate, lineHeight: 1.3 }}>
        <div style={{ color: T.ink, fontWeight: 500 }}>{time || "—"}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={job.status} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: T.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {job.title}
          </span>
        </div>
        <div style={{ fontSize: 12, color: T.mute, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{job.customer.name}</span>
          {job.postcode && (
            <>
              <span>·</span>
              <span>{job.postcode}</span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 500, color: T.navy }}>{formatGBP(job.total)}</span>
        <Icon name="chevron-right" size={14} color={T.mute} />
      </div>
    </div>
  );
}

function ActivityRow({ a, divider }: { a: DerivedActivity; divider: boolean }) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    coral: { bg: T.coralTint, fg: T.coral },
    amber: { bg: T.amber50, fg: T.amber },
    green: { bg: T.green50, fg: T.green },
    navy: { bg: T.paper2, fg: T.navy },
  };
  const t = toneMap[a.tone];
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: divider ? `1px solid ${T.line}` : "none" }} className="fx-rise">
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          flexShrink: 0,
          background: t.bg,
          color: t.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={a.icon} size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.4 }}>{a.text}</div>
        {a.meta && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{a.meta}</div>}
        {a.when && <div style={{ fontSize: 11, color: T.mute, marginTop: 3 }}>{a.when}</div>}
      </div>
    </div>
  );
}

function MiniCard({
  icon,
  tone,
  title,
  line1,
  line2,
  cta,
  onCta,
}: {
  icon: string;
  tone: "navy" | "coral" | "amber" | "green";
  title: string;
  line1: ReactNode;
  line2: ReactNode;
  cta: string;
  onCta: () => void;
}) {
  const toneMap = {
    navy: { bg: T.paper2, fg: T.navy },
    coral: { bg: T.coralTint, fg: T.coral },
    amber: { bg: T.amber50, fg: T.amber },
    green: { bg: T.green50, fg: T.green },
  } as const;
  const t = toneMap[tone];
  return (
    <Card style={{ padding: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          flexShrink: 0,
          background: t.bg,
          color: t.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{title}</div>
        <div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>{line1}</div>
        <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{line2}</div>
        <button
          onClick={onCta}
          style={{
            marginTop: 8,
            padding: 0,
            background: "transparent",
            border: "none",
            color: T.coral,
            fontFamily: T.sans,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {cta} <Icon name="arrow-right" size={12} />
        </button>
      </div>
    </Card>
  );
}
