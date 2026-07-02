"use client";

// Schedule — Day/Week/Month/Agenda, wired to the partner's real jobs (useMyJobs).
// Events are grouped by jobs.scheduled_date; times come from scheduled_start/end_at
// (rendered in Europe/London). Month/Week/Day navigate via a single date cursor.

import { Fragment, useMemo, useState } from "react";
import { T } from "@/lib/tokens";
import { Badge, Button, Card, Icon, IconButton, SectionHeader, STATUS_LABELS, Tabs } from "@/components/ui/primitives";
import { formatGBP } from "@/lib/format";
import { useMyJobs } from "@/components/jobs-context";
import type { JobStatus } from "@/types";

type OpenJob = (id: string) => void;

const LONDON = "Europe/London";
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20; // exclusive top of grid (rows 08:00..19:00)

const STATUS_COLOR: Record<string, string> = {
  in_progress: T.coral,
  scheduled: T.blue,
  final_check: T.amber,
  completed: T.green,
  cancelled: T.mute,
};
function badgeTone(status: string): string {
  return status; // Badge tones now cover all job statuses directly
}

interface SchedEvent {
  jobId: string;
  date: string; // YYYY-MM-DD
  title: string;
  customer: string;
  status: JobStatus;
  total: number;
  startMin: number | null; // minutes since midnight (London)
  endMin: number | null;
  startLabel: string;
  endLabel: string;
}

function londonHM(iso: string): { h: number; m: number } {
  const s = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LONDON });
  const [h, m] = s.split(":").map(Number);
  return { h, m };
}
function londonTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: LONDON });
}
function isoFromYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return d;
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleView({
  onOpenJob,
  previewMode = false,
  redactSensitive = false,
}: {
  onOpenJob: OpenJob;
  previewMode?: boolean;
  redactSensitive?: boolean;
}) {
  const { jobs, loading, error, refresh } = useMyJobs();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState<Date>(() => {
    const t = londonTodayISO().split("-").map(Number);
    return new Date(t[0], t[1] - 1, t[2]);
  });

  const tabs = [
    { id: "day", label: "Day", icon: "sun" },
    { id: "week", label: "Week", icon: "calendar-days" },
    { id: "month", label: "Month", icon: "calendar" },
    { id: "agenda", label: "Agenda", icon: "list" },
  ];

  const { byDate, eventsInMonth } = useMemo(() => {
    const map = new Map<string, SchedEvent[]>();
    for (const j of jobs) {
      if (!j.scheduledDate) continue;
      const start = j.scheduledStartAt ? londonHM(j.scheduledStartAt) : null;
      const end = j.scheduledEndAt ? londonHM(j.scheduledEndAt) : null;
      const ev: SchedEvent = {
        jobId: j.id,
        date: j.scheduledDate,
        title: redactSensitive ? "Assigned job" : j.title,
        customer: redactSensitive ? "Customer" : j.customer.name,
        status: j.status,
        total: redactSensitive ? 0 : j.total,
        startMin: start ? start.h * 60 + start.m : null,
        endMin: end ? end.h * 60 + end.m : null,
        startLabel: j.scheduled?.split(", ")[1]?.split("–")[0] ?? "",
        endLabel: j.scheduled?.split("–")[1] ?? "",
      };
      const arr = map.get(ev.date) ?? [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
    const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    let count = 0;
    for (const [date, arr] of map) if (date.startsWith(monthPrefix)) count += arr.length;
    return { byDate: map, eventsInMonth: count };
  }, [jobs, cursor, redactSensitive]);

  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const stepCursor = (dir: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };
  const goToday = () => {
    const t = londonTodayISO().split("-").map(Number);
    setCursor(new Date(t[0], t[1] - 1, t[2]));
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: T.mute, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="loader" size={16} color={T.mute} /> Loading your schedule…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 14, color: T.ink }}>Couldn&apos;t load your schedule: {error}</div>
        <Button variant="secondary" size="sm" icon="refresh-cw" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, flex: 1, overflow: "hidden" }}>
      <SectionHeader
        title="Schedule"
        subtitle={`${monthLabel} · ${eventsInMonth} scheduled ${eventsInMonth === 1 ? "job" : "jobs"} this month`}
        actions={<Tabs tabs={tabs} active={view} onChange={setView} variant="pills" />}
      />

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <WeekSummary cursor={cursor} byDate={byDate} onOpenJob={onOpenJob} />
        {view === "month" && (
          <MonthGrid cursor={cursor} byDate={byDate} monthLabel={monthLabel} onOpenJob={onOpenJob} onStep={stepCursor} onToday={goToday} />
        )}
        {view === "week" && <WeekGrid cursor={cursor} byDate={byDate} onOpenJob={onOpenJob} onStep={stepCursor} onToday={goToday} />}
        {view === "day" && <DayList cursor={cursor} byDate={byDate} onOpenJob={onOpenJob} onStep={stepCursor} onToday={goToday} />}
        {view === "agenda" && <AgendaList byDate={byDate} onOpenJob={onOpenJob} />}
      </div>
    </div>
  );
}

function durationHours(ev: SchedEvent): number {
  if (ev.startMin == null || ev.endMin == null || ev.endMin <= ev.startMin) return 0;
  return (ev.endMin - ev.startMin) / 60;
}

function WeekSummary({ cursor, byDate, onOpenJob }: { cursor: Date; byDate: Map<string, SchedEvent[]>; onOpenJob: OpenJob }) {
  const today = londonTodayISO();
  const monday = mondayOf(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoFromYMD(d.getFullYear(), d.getMonth(), d.getDate());
    const evs = byDate.get(iso) ?? [];
    return {
      name: WEEKDAYS[i],
      date: d.getDate(),
      iso,
      jobs: evs.length,
      hours: evs.reduce((s, e) => s + durationHours(e), 0),
      earn: evs.reduce((s, e) => s + e.total, 0),
      firstJobId: evs[0]?.jobId,
      isToday: iso === today,
    };
  });
  const weekTotal = days.reduce((s, d) => s + d.earn, 0);
  const weekJobs = days.reduce((s, d) => s + d.jobs, 0);
  const weekHours = days.reduce((s, d) => s + d.hours, 0);
  const rangeLabel = `${monday.getDate()} – ${days[6].date} ${days[6].iso === today ? "" : ""}${cursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 14px 12px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.navy }}>This week</div>
        <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{rangeLabel}</div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {days.map((d) => (
          <div
            key={d.iso}
            onClick={() => d.firstJobId && onOpenJob(d.firstJobId)}
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderBottom: `1px solid ${T.line}`,
              cursor: d.jobs > 0 ? "pointer" : "default",
              background: d.isToday ? T.coralTint : "transparent",
            }}
          >
            <div style={{ width: 36, textAlign: "center" }}>
              <div style={{ fontSize: 10.5, color: d.isToday ? T.coral : T.mute, letterSpacing: 0.4, textTransform: "uppercase" }}>
                {d.name}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 500, color: d.isToday ? T.coral : T.ink }}>{d.date}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 500 }}>
                {d.jobs === 0 ? <span style={{ color: T.mute }}>Free</span> : `${d.jobs} job${d.jobs === 1 ? "" : "s"}`}
              </div>
              {d.jobs > 0 && (
                <div style={{ fontSize: 11, color: T.mute, marginTop: 2 }}>
                  {d.hours > 0 && <>{d.hours.toFixed(d.hours % 1 === 0 ? 0 : 1)}h · </>}
                  <span className="fx-mono">{formatGBP(d.earn)}</span>
                </div>
              )}
            </div>
            {d.jobs > 0 && <span style={{ width: 6, height: 6, borderRadius: 9999, background: d.isToday ? T.coral : T.blue }} />}
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.line}`, background: T.paper }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ flex: 1, fontSize: 11, color: T.mute, letterSpacing: 0.3 }}>WEEK TOTAL</span>
          <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 500, color: T.navy }}>{formatGBP(weekTotal)}</span>
        </div>
        <div style={{ fontSize: 11, color: T.mute, marginTop: 2 }}>
          {weekHours > 0 ? `${weekHours.toFixed(weekHours % 1 === 0 ? 0 : 1)} hours · ` : ""}
          {weekJobs} job{weekJobs === 1 ? "" : "s"}
        </div>
      </div>
    </Card>
  );
}

function CalHeader({
  label,
  onStep,
  onToday,
  hint,
}: {
  label: string;
  onStep: (dir: number) => void;
  onToday: () => void;
  hint?: string;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
      <IconButton icon="chevron-left" size={28} tone="ghost" onClick={() => onStep(-1)} />
      <span style={{ fontSize: 14, fontWeight: 500, color: T.navy, minWidth: 150, textAlign: "center" }}>{label}</span>
      <IconButton icon="chevron-right" size={28} tone="ghost" onClick={() => onStep(1)} />
      <Button variant="ghost" size="sm" onClick={onToday}>
        Today
      </Button>
      <span style={{ flex: 1 }} />
      {hint && <span style={{ fontSize: 12, color: T.mute }}>{hint}</span>}
    </div>
  );
}

function MonthGrid({
  cursor,
  byDate,
  monthLabel,
  onOpenJob,
  onStep,
  onToday,
}: {
  cursor: Date;
  byDate: Map<string, SchedEvent[]>;
  monthLabel: string;
  onOpenJob: OpenJob;
  onStep: (dir: number) => void;
  onToday: () => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = londonTodayISO();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return (
    <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <CalHeader label={monthLabel} onStep={onStep} onToday={onToday} hint="Click an event to open the job" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.line}` }}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            style={{
              padding: "8px 10px",
              fontSize: 10.5,
              letterSpacing: 0.4,
              color: T.mute,
              textAlign: "left",
              fontWeight: 500,
              textTransform: "uppercase",
              borderRight: d === "Sun" ? "none" : `1px solid ${T.line}`,
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: `repeat(${totalCells / 7}, 1fr)`,
          minHeight: 0,
        }}
      >
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - firstWeekday + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
          const iso = inMonth ? isoFromYMD(year, month, dayNum) : "";
          const isToday = iso === today;
          const dayEvents = inMonth ? byDate.get(iso) ?? [] : [];
          const isSunday = (idx + 1) % 7 === 0;
          const isBottom = idx >= totalCells - 7;
          return (
            <div
              key={idx}
              style={{
                padding: 6,
                minHeight: 0,
                borderRight: isSunday ? "none" : `1px solid ${T.line}`,
                borderBottom: isBottom ? "none" : `1px solid ${T.line}`,
                background: !inMonth ? T.paper : isToday ? T.coralTint : T.white,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                opacity: !inMonth ? 0.5 : 1,
                overflow: "hidden",
              }}
            >
              {inMonth && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, color: isToday ? T.coral : T.slate }}>{dayNum}</span>
                  {isToday && <span style={{ fontSize: 9, color: T.coral, fontWeight: 600, letterSpacing: 0.4 }}>TODAY</span>}
                </div>
              )}
              {dayEvents.slice(0, 3).map((e, i) => {
                const color = STATUS_COLOR[e.status] ?? T.blue;
                return (
                  <div
                    key={i}
                    onClick={() => onOpenJob(e.jobId)}
                    style={{
                      padding: "3px 6px",
                      borderRadius: 4,
                      fontSize: 10.5,
                      cursor: "pointer",
                      background: `${color}1A`,
                      color,
                      borderLeft: `2px solid ${color}`,
                      fontWeight: 500,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.startLabel && (
                      <span className="fx-mono" style={{ marginRight: 4 }}>
                        {e.startLabel}
                      </span>
                    )}
                    {e.title}
                  </div>
                );
              })}
              {dayEvents.length > 3 && <div style={{ fontSize: 10, color: T.mute, paddingLeft: 6 }}>+{dayEvents.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekGrid({
  cursor,
  byDate,
  onOpenJob,
  onStep,
  onToday,
}: {
  cursor: Date;
  byDate: Map<string, SchedEvent[]>;
  onOpenJob: OpenJob;
  onStep: (dir: number) => void;
  onToday: () => void;
}) {
  const today = londonTodayISO();
  const monday = mondayOf(cursor);
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoFromYMD(d.getFullYear(), d.getMonth(), d.getDate());
    return { iso, label: `${WEEKDAYS[i]} ${d.getDate()}`, isToday: iso === today, events: byDate.get(iso) ?? [] };
  });
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const rangeLabel = `${monday.getDate()} – ${cols[6].iso.split("-")[2].replace(/^0/, "")} ${cursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;

  return (
    <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <CalHeader label={rangeLabel} onStep={onStep} onToday={onToday} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "50px repeat(7, 1fr)", overflow: "auto" }}>
        <div style={{ borderRight: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }} />
        {cols.map((c, i) => (
          <div
            key={i}
            style={{
              padding: "8px 10px",
              fontSize: 11.5,
              fontWeight: 500,
              color: c.isToday ? T.coral : T.slate,
              borderRight: i === 6 ? "none" : `1px solid ${T.line}`,
              borderBottom: `1px solid ${T.line}`,
              background: c.isToday ? T.coralTint : "transparent",
            }}
          >
            {c.label}
          </div>
        ))}
        {hours.map((hour) => (
          <Fragment key={hour}>
            <div
              style={{
                padding: "4px 8px",
                fontFamily: T.mono,
                fontSize: 10,
                color: T.mute,
                borderRight: `1px solid ${T.line}`,
                borderBottom: `1px solid ${T.line}`,
                textAlign: "right",
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
            {cols.map((c, day) => {
              const cellEvents = c.events.filter((e) => {
                if (e.startMin == null) return hour === DAY_START_HOUR; // untimed → top row
                const h = Math.min(DAY_END_HOUR - 1, Math.max(DAY_START_HOUR, Math.floor(e.startMin / 60)));
                return h === hour;
              });
              return (
                <div
                  key={day}
                  style={{
                    borderRight: day === 6 ? "none" : `1px solid ${T.line}`,
                    borderBottom: `1px solid ${T.line}`,
                    minHeight: 40,
                    padding: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    background: c.isToday ? "rgba(237,75,0,0.02)" : T.white,
                  }}
                >
                  {cellEvents.map((e, i) => {
                    const color = STATUS_COLOR[e.status] ?? T.blue;
                    return (
                      <div
                        key={i}
                        onClick={() => onOpenJob(e.jobId)}
                        style={{
                          background: `${color}1A`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 4,
                          padding: "3px 5px",
                          cursor: "pointer",
                          fontSize: 10.5,
                          color,
                          lineHeight: 1.25,
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                        {e.startLabel && (
                          <div className="fx-mono" style={{ fontSize: 9.5, opacity: 0.75 }}>
                            {e.startLabel}
                            {e.endLabel ? `–${e.endLabel}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

function DayList({
  cursor,
  byDate,
  onOpenJob,
  onStep,
  onToday,
}: {
  cursor: Date;
  byDate: Map<string, SchedEvent[]>;
  onOpenJob: OpenJob;
  onStep: (dir: number) => void;
  onToday: () => void;
}) {
  const iso = isoFromYMD(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  const events = byDate.get(iso) ?? [];
  const label = cursor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <CalHeader label={label} onStep={onStep} onToday={onToday} />
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {events.length === 0 && (
          <div style={{ padding: 24, color: T.mute, fontSize: 13, textAlign: "center" }}>Nothing scheduled this day.</div>
        )}
        {events.map((e, i) => (
          <div
            key={i}
            onClick={() => onOpenJob(e.jobId)}
            style={{
              padding: 14,
              background: T.white,
              border: `1px solid ${T.line}`,
              borderRadius: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
              borderLeft: `4px solid ${STATUS_COLOR[e.status] ?? T.blue}`,
            }}
          >
            <div className="fx-mono" style={{ fontSize: 13, color: T.slate, minWidth: 100 }}>
              <div style={{ color: T.ink, fontWeight: 500 }}>{e.startLabel || "—"}</div>
              {e.endLabel && <div style={{ color: T.mute, fontSize: 11 }}>→ {e.endLabel}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.ink }}>{e.title}</div>
              <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{e.customer}</div>
            </div>
            <Badge tone={badgeTone(e.status)}>{STATUS_LABELS[e.status]}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AgendaList({ byDate, onOpenJob }: { byDate: Map<string, SchedEvent[]>; onOpenJob: OpenJob }) {
  const today = londonTodayISO();
  const upcoming = useMemo(() => {
    const out: SchedEvent[] = [];
    for (const [date, arr] of byDate) if (date >= today) out.push(...arr);
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0));
  }, [byDate, today]);

  return (
    <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 14, fontWeight: 500, color: T.navy }}>Upcoming</div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {upcoming.length === 0 && (
          <div style={{ padding: 24, color: T.mute, fontSize: 13, textAlign: "center" }}>No upcoming jobs scheduled.</div>
        )}
        {upcoming.map((e, i) => {
          const dayLabel = new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
          return (
            <div
              key={i}
              onClick={() => onOpenJob(e.jobId)}
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                borderBottom: `1px solid ${T.line}`,
                cursor: "pointer",
              }}
            >
              <div className="fx-mono" style={{ fontSize: 13, color: T.slate, minWidth: 110 }}>
                <div style={{ color: T.ink, fontWeight: 500 }}>{dayLabel}</div>
                {e.startLabel && (
                  <div style={{ color: T.mute, fontSize: 11 }}>
                    {e.startLabel}
                    {e.endLabel ? `–${e.endLabel}` : ""}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.ink }}>{e.title}</div>
                <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{e.customer}</div>
              </div>
              <Badge tone={badgeTone(e.status)}>{STATUS_LABELS[e.status]}</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
