"use client";

// My jobs — Board / List / Map. Ported from jobs.jsx.

import { useMemo, useState } from "react";
import { T } from "@/lib/tokens";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  SectionHeader,
  STATUS_LABELS,
  Tabs,
} from "@/components/ui/primitives";
import { JobsMap as JobsMapView } from "@/components/ui/jobs-map";
import { QuoteAddressMap } from "@/components/ui/quote-address-map";
import { partnerLocationLine } from "@/lib/partner-customer";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { formatGBP } from "@/lib/format";
import { jobMatchesDateFilter } from "@/lib/date-range-filter";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { OnHoldResponseForm } from "@/components/screens/on-hold-response-form";
import { useMyJobs } from "@/components/jobs-context";
import { useToast } from "@/components/ui/toast";
import type { JobSource, JobStatus, MyJob } from "@/types";

type OpenJob = (id: string) => void;

export function MyJobsView({
  onOpenJob,
  defaultView = "board",
  previewMode = false,
}: {
  onOpenJob: OpenJob;
  defaultView?: string;
  previewMode?: boolean;
}) {
  const [view, setView] = useState(defaultView);
  const { jobs, loading, error } = useMyJobs();
  const { value: dateFilter, setValue: setDateFilter, label: dateFilterLabel } = useDateRangeFilter();

  const filteredJobs = useMemo(
    () => jobs.filter((j) => jobMatchesDateFilter(j, dateFilter)),
    [jobs, dateFilter],
  );

  const tabs = [
    { id: "board", label: "Board", icon: "columns-3" },
    { id: "list", label: "List", icon: "list" },
    { id: "map", label: "Map", icon: "map" },
  ];

  const activeCount = filteredJobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, flex: 1, overflow: "hidden" }}>
      <SectionHeader
        title="My jobs"
        subtitle={
          loading
            ? "Loading…"
            : `${filteredJobs.length} of ${jobs.length} jobs · ${activeCount} active · ${dateFilterLabel.toLowerCase()}`
        }
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            <Tabs tabs={tabs} active={view} onChange={setView} variant="pills" />
            <Button variant="secondary" icon="download">Export</Button>
          </div>
        }
      />

      {error ? (
        <EmptyState icon="alert-triangle" title="Couldn't load your jobs" hint={error} />
      ) : loading ? (
        <EmptyState icon="loader" title="Loading your jobs…" />
      ) : jobs.length === 0 ? (
        <EmptyState icon="briefcase" title="No jobs yet" hint="Accepted jobs and assignments will appear here." />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No jobs in this period"
          hint={`Try a different date range — currently showing ${dateFilterLabel.toLowerCase()}.`}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {view === "board" && <JobsBoard onOpenJob={onOpenJob} jobs={filteredJobs} />}
          {view === "list" && <JobsList onOpenJob={onOpenJob} jobs={filteredJobs} />}
          {view === "map" && <JobsMap onOpenJob={onOpenJob} jobs={filteredJobs} />}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOARD
// ============================================================
const BASE_BOARD_COLUMNS = [
  { id: "scheduled", label: "Scheduled", accent: T.blue },
  { id: "in_progress", label: "In progress", accent: T.coral },
  { id: "final_check", label: "Final checks", accent: T.amber },
  { id: "completed", label: "Completed", accent: T.green },
  { id: "cancelled", label: "Cancelled", accent: T.mute },
] as const;

function JobsBoard({ onOpenJob, jobs }: { onOpenJob: OpenJob; jobs: MyJob[] }) {
  const toast = useToast();
  const { refresh } = useMyJobs();
  const needsAttentionJobs = jobs.filter((j) => j.needsAttention);
  const regularJobs = jobs.filter((j) => !j.needsAttention);

  const columns = [
    ...(needsAttentionJobs.length > 0
      ? [{ id: "needs_attention" as const, label: "Needs attention", accent: T.coral, highlight: true }]
      : []),
    ...BASE_BOARD_COLUMNS.map((c) => ({ ...c, highlight: false })),
  ];

  const itemsForColumn = (id: string) => {
    if (id === "needs_attention") return needsAttentionJobs;
    return regularJobs.filter((j) => j.status === id);
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`,
          gap: 12,
          minHeight: "100%",
        }}
      >
        {columns.map((col) => {
          const items = itemsForColumn(col.id);
          const total = items.reduce((s, j) => s + j.total, 0);
          return (
            <div
              key={col.id}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                background: col.highlight ? "linear-gradient(180deg, #FFF5F2 0%, #FAFAFC 28%)" : T.paper,
                borderRadius: 12,
                border: col.highlight ? `1.5px solid ${T.coral}` : `1px solid ${T.line}`,
                boxShadow: col.highlight ? "0 0 0 1px rgba(237,75,0,0.08)" : undefined,
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: `1px solid ${col.highlight ? "rgba(237,75,0,0.2)" : T.line}`,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: col.accent,
                    ...(col.highlight
                      ? { boxShadow: `0 0 0 3px rgba(237,75,0,0.2)`, animation: "fx-pulse 1.6s ease-in-out infinite" }
                      : {}),
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: col.highlight ? 600 : 500, color: col.highlight ? T.coral : T.ink }}>
                  {col.label}
                </span>
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 9999,
                    background: T.white,
                    color: col.highlight ? T.coral : T.slate,
                    border: `1px solid ${col.highlight ? "rgba(237,75,0,0.25)" : T.line}`,
                  }}
                >
                  {items.length}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{formatGBP(total)}</span>
              </div>
              <div style={{ padding: 10, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {items.map((j) =>
                  j.needsAttention ? (
                    <NeedsAttentionCard
                      key={j.id}
                      job={j}
                      onOpen={() => onOpenJob(j.id)}
                      onShowToast={toast}
                      onSubmitted={refresh}
                    />
                  ) : (
                    <BoardCard key={j.id} job={j} onClick={() => onOpenJob(j.id)} />
                  ),
                )}
                {items.length === 0 && (
                  <div
                    style={{
                      padding: 20,
                      fontSize: 12,
                      color: T.mute,
                      textAlign: "center",
                      border: `1.5px dashed ${T.line}`,
                      borderRadius: 8,
                    }}
                  >
                    No jobs here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NeedsAttentionCard({
  job,
  onOpen,
  onShowToast,
  onSubmitted,
}: {
  job: MyJob;
  onOpen: () => void;
  onShowToast: (t: import("@/components/ui/toast").ToastInput) => void;
  onSubmitted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isComplaint = job.onHoldPresetId === "complaint";
  const reason = job.onHoldComplaintDescription || job.onHoldReason;

  return (
    <div
      style={{
        background: T.white,
        border: `1.5px solid ${isComplaint ? T.coral : T.amber}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "0 2px 8px rgba(237,75,0,0.08)",
      }}
    >
      <div style={{ cursor: "pointer" }} onClick={onOpen}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="fx-mono" style={{ fontSize: 10.5, color: T.mute }}>{job.id}</span>
          <span style={{ flex: 1 }} />
          <Badge tone={isComplaint ? "coral" : "warning"} size="sm">
            {job.onHoldLabel || "On hold"}
          </Badge>
        </div>
        <JobCardMap job={job} />
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{job.title}</div>
        <div style={{ fontSize: 11.5, color: T.slate, lineHeight: 1.35 }}>
          {partnerLocationLine(job.postcode, job.customer.address)}
        </div>
        {reason ? (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 11.5,
              color: T.slate,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: "vertical",
              overflow: expanded ? "visible" : "hidden",
            }}
          >
            {reason}
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            variant={expanded ? "secondary" : "primary"}
            size="sm"
            icon={expanded ? "chevron-up" : "message-square"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : job.onHoldSubmissionAt ? "View response" : "Respond"}
          </Button>
        </div>
        <Button variant="ghost" size="sm" iconRight="arrow-up-right" onClick={onOpen}>
          Open
        </Button>
      </div>

      {expanded ? (
        <OnHoldResponseForm job={job} compact onShowToast={onShowToast} onSubmitted={onSubmitted} />
      ) : null}
    </div>
  );
}

function JobCardMap({ job }: { job: MyJob }) {
  return (
    <QuoteAddressMap
      address={job.customer.address}
      postcode={job.postcode}
      lat={job.lat}
      lng={job.lng}
      compact
      interactive={false}
      minHeight={72}
      maxHeight={80}
      addressOverlay={job.postcode || partnerLocationLine(job.postcode, job.customer.address)}
    />
  );
}

function BoardCard({ job, onClick }: { job: MyJob; onClick: () => void }) {
  const [h, setH] = useState(false);
  const progress = job.checklistTotal ? job.checklistDone / job.checklistTotal : 0;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: T.white,
        border: `1px solid ${h ? T.lineStrong : T.line}`,
        borderRadius: 10,
        padding: 12,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: h ? "0 1px 2px rgba(2,0,64,0.06)" : "none",
        transition: `all 120ms ${T.ease}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="fx-mono" style={{ fontSize: 10.5, color: T.mute }}>
          {job.id}
        </span>
        <span style={{ flex: 1 }} />
        <SourceTag source={job.source} />
      </div>
      <JobCardMap job={job} />
      <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, lineHeight: 1.35 }}>{job.title}</div>

      <div style={{ fontSize: 11.5, color: T.slate, lineHeight: 1.35 }}>
        {partnerLocationLine(job.postcode, job.customer.address)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: T.mute }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="map-pin" size={11} /> {job.postcode}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="calendar" size={11} /> {job.scheduled?.split(",")[0]}
        </span>
      </div>

      {job.status === "in_progress" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.coral, marginBottom: 4 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 9999,
                background: T.coral,
                animation: "fx-pulse 1.6s ease-in-out infinite",
              }}
            />
            <span className="fx-mono">{job.elapsed} elapsed</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: T.mute }}>
              {job.checklistDone}/{job.checklistTotal}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 9999, background: T.line, overflow: "hidden" }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: T.coral }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6, borderTop: `1px solid ${T.line}` }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 500, color: T.navy }}>{formatGBP(job.total)}</span>
        {job.status === "final_check" && <Badge tone="warning" size="sm">Final checks</Badge>}
        {job.status === "completed" && job.rating && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: T.amber }}>
            <Icon name="star" size={11} /> {job.rating}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Icon name="arrow-up-right" size={13} color={T.mute} />
      </div>
    </div>
  );
}

export function SourceTag({ source }: { source: JobSource }) {
  const map = {
    job: { icon: "wrench", label: "Job", tone: T.blue },
    lead: { icon: "user-plus", label: "Lead", tone: T.coral },
    quote: { icon: "file-text", label: "Quote", tone: T.green },
  } as const;
  const m = map[source];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: m.tone, fontWeight: 500 }}>
      <Icon name={m.icon} size={10} />
      {m.label}
    </span>
  );
}

// ============================================================
// LIST
// ============================================================
function JobsList({ onOpenJob, jobs }: { onOpenJob: OpenJob; jobs: MyJob[] }) {
  return (
    <Card style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ overflow: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: T.paper, zIndex: 1 }}>
            <tr>
              {["Ref", "Job", "Source", "Trade", "Location", "When", "Status", "Value", ""].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    fontSize: 10.5,
                    fontWeight: 500,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: T.mute,
                    borderBottom: `1px solid ${T.line}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <ListRow key={j.id} job={j} onClick={() => onOpenJob(j.id)} last={i === jobs.length - 1} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ListRow({ job, onClick, last }: { job: MyJob; onClick: () => void; last: boolean }) {
  const [h, setH] = useState(false);
  const statusTone: Record<JobStatus, string> = {
    scheduled: "scheduled",
    in_progress: "in_progress",
    final_check: "final_check",
    completed: "completed",
    cancelled: "cancelled",
  };
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        cursor: "pointer",
        background: h ? T.paper : T.white,
        borderBottom: last ? "none" : `1px solid ${T.line}`,
        transition: `background 120ms ${T.ease}`,
      }}
    >
      <td style={{ padding: "12px 14px", fontFamily: T.mono, fontSize: 12, color: T.slate }}>{job.id}</td>
      <td style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{job.title}</div>
        <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
          {partnerLocationLine(job.postcode, job.customer.address)}
        </div>
      </td>
      <td style={{ padding: "12px 14px" }}>
        <SourceTag source={job.source} />
      </td>
      <td style={{ padding: "12px 14px", fontSize: 12.5, color: T.slate }}>{job.trade}</td>
      <td style={{ padding: "12px 14px", fontSize: 12.5, color: T.slate }}>
        <span className="fx-mono">{job.postcode}</span>
        <span style={{ color: T.mute, marginLeft: 6 }}>· {job.distance} mi</span>
      </td>
      <td style={{ padding: "12px 14px", fontSize: 12.5, color: T.slate }}>{job.scheduled || job.completed}</td>
      <td style={{ padding: "12px 14px" }}>
        {job.needsAttention ? (
          <Badge tone="coral" size="sm">{job.onHoldLabel || "Needs attention"}</Badge>
        ) : (
          <Badge tone={statusTone[job.status]}>{STATUS_LABELS[job.status]}</Badge>
        )}
      </td>
      <td style={{ padding: "12px 14px", fontFamily: T.mono, fontSize: 13, fontWeight: 500, color: T.navy }}>
        {formatGBP(job.total)}
      </td>
      <td style={{ padding: "12px 14px" }}>
        <Icon name="chevron-right" size={14} color={T.mute} />
      </td>
    </tr>
  );
}

// ============================================================
// MAP
// ============================================================
function JobsMap({ onOpenJob, jobs }: { onOpenJob: OpenJob; jobs: MyJob[] }) {
  const dotColor = (s: string): string =>
    ({ in_progress: T.coral, scheduled: T.blue, final_check: T.amber, completed: T.green, cancelled: T.mute }[s] ?? T.blue);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 320px) 1fr",
        gap: 12,
        flex: 1,
        minHeight: 0,
        height: "100%",
      }}
    >
      {/* List */}
      <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 500, color: T.navy }}>
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {jobs.map((j, i) => (
            <div
              key={j.id}
              onClick={() => onOpenJob(j.id)}
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                borderBottom: i === jobs.length - 1 ? "none" : `1px solid ${T.line}`,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 9999,
                  background: dotColor(j.status),
                  color: T.white,
                  fontSize: 10.5,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: T.mono,
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: T.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {j.title}
                </div>
                <div style={{ fontSize: 11, color: T.mute }}>
                  {j.postcode} · <span className="fx-mono">{j.distance} mi</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Map tile — full height Mapbox with job pins */}
      <Card
        style={{
          overflow: "hidden",
          position: "relative",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <JobsMapView jobs={jobs} onOpenJob={onOpenJob} fill />

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: T.white,
            border: `1px solid ${T.line}`,
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 11.5,
            boxShadow: "0 4px 8px rgba(2,0,64,0.06)",
          }}
        >
          {[
            { s: "in_progress", label: "In progress" },
            { s: "scheduled", label: "Scheduled" },
            { s: "final_check", label: "Final checks" },
            { s: "completed", label: "Done" },
          ].map((l) => (
            <span key={l.s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: dotColor(l.s) }} />
              <span style={{ color: T.slate }}>{l.label}</span>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
