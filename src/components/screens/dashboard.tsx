"use client";

// Dashboard — greeting, trial nudge, KPI strip, today's schedule, activity feed, mini cards.
// Wired to the partner's real jobs (useMyJobs). KPIs/activity/today are derived from those
// rows; supply-side metrics (new leads, available jobs) return once those tables/screens land.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Badge, Button, Card, Icon, IconButton, StatCard, StatusDot } from "@/components/ui/primitives";
import { formatGBP } from "@/lib/format";
import { jobMatchesDateFilter, londonYmd } from "@/lib/date-range-filter";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { usePartner } from "@/components/partner-context";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import type { ActivityTone, MyJob } from "@/types";

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return londonYmd(d);
}

interface DerivedActivity {
  id: string;
  icon: string;
  tone: ActivityTone;
  text: string;
  meta?: string;
  when: string;
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
}: {
  onOpenJob: (id: string) => void;
  onNav: (route: string) => void;
}) {
  const partner = usePartner();
  const { jobs, loading, error, refresh } = useMyJobs();
  const { value: dateFilter, setValue: setDateFilter, label: dateFilterLabel } = useDateRangeFilter();

  // Real extras the partner context doesn't carry: compliance docs + live trial days.
  // Best-effort (tolerate missing mig-196 columns) so the dashboard never breaks.
  const [docs, setDocs] = useState<PartnerDoc[] | null>(null);
  const [trialDays, setTrialDays] = useState<number>(partner.trialDaysLeft);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
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
        /* mig 196 not applied — keep context value */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const docSummary = useMemo(() => {
    if (!docs) return null;
    const verified = docs.filter((x) => x.status === "verified").length;
    const expiringSoon = docs.find((x) => x.warning);
    return { total: docs.length, verified, expiringSoon };
  }, [docs]);

  const d = useMemo(() => {
    const today = londonYmd();
    const filteredJobs = jobs.filter((j) => jobMatchesDateFilter(j, dateFilter));
    const scheduleJobs = filteredJobs
      .filter((j) => j.status !== "completed" && j.status !== "cancelled")
      .sort((a, b) => (a.scheduled ?? "").localeCompare(b.scheduled ?? ""));

    // Rolling 7-day earnings (independent of date chip — headline KPI).
    const trendDays = Array.from({ length: 7 }, (_, i) => daysAgoYmd(6 - i));
    const trend = trendDays.map((day) =>
      jobs.filter((j) => j.status === "completed" && j.completedDate === day).reduce((s, j) => s + j.total, 0),
    );
    const weekEarnings = trend.reduce((s, n) => s + n, 0);

    const active = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress");
    const awaiting = jobs.filter((j) => j.status === "final_check");
    const since30 = daysAgoYmd(30);
    const completed30 = jobs.filter((j) => j.status === "completed" && (j.completedDate ?? "") >= since30);
    const pendingPayout = awaiting.reduce((s, j) => s + j.total, 0);
    const scheduleTotal = scheduleJobs.reduce((s, j) => s + j.total, 0);
    const inProgress = jobs.find((j) => j.status === "in_progress");

    return {
      today,
      scheduleJobs,
      trend,
      weekEarnings,
      active,
      awaiting,
      completed30,
      pendingPayout,
      scheduleTotal,
      inProgress,
      filteredCount: filteredJobs.length,
    };
  }, [jobs, dateFilter]);

  const activity = useMemo<DerivedActivity[]>(() => {
    const items: (DerivedActivity & { sortKey: string })[] = [];
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
    return items
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, 6)
      .map(({ sortKey: _sortKey, ...rest }) => rest);
  }, [jobs, dateFilter]);

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

      {/* Trial nudge banner — only while on trial */}
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
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: T.amber50,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
              That&apos;s <b>0% commission</b> on your completed work.{" "}
              {trialDays} day{trialDays === 1 ? "" : "s"} left on your trial.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNav("settings:billing")}>
            Review plan
          </Button>
          <IconButton icon="x" size={28} tone="ghost" />
        </Card>
      )}

      {/* KPI strip — all derived from real jobs */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 12 }}>
        <StatCard
          hero
          label="This week's earnings"
          value={formatGBP(d.weekEarnings)}
          hint="Completed, last 7 days"
          trend={d.trend}
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

      {/* Two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
        {/* Today's schedule */}
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
                  in this period
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{formatGBP(d.scheduleTotal)} value</span>
              </div>
            )}
          </div>
        </Card>

        {/* Activity feed */}
        <Card>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.navy }}>Activity</div>
            <Badge tone="coral" dot>
              Live
            </Badge>
          </div>
          <div>
            {activity.map((a, i) => (
              <ActivityRow key={a.id} a={a} divider={i < activity.length - 1} />
            ))}
            {activity.length === 0 && (
              <div style={{ padding: 24, color: T.mute, fontSize: 13, textAlign: "center" }}>
                No recent activity yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Footer — three mini cards */}
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
                  ? "Upload your insurance & certs to get jobs"
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
        <div style={{ color: T.mute, fontSize: 11 }}>{job.durationEst}</div>
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
    <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: divider ? `1px solid ${T.line}` : "none" }}>
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
