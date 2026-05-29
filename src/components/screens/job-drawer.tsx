"use client";

// Job drawer — slides from right, 5 tabs (Overview, Checklist, Photos, Notes, Sign-off),
// sticky progress footer. Ported from job-drawer.jsx.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { T } from "@/lib/tokens";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  STATUS_LABELS,
  Tabs,
  Toggle,
} from "@/components/ui/primitives";
import { MapBackground } from "@/components/ui/map-background";
import { JobsMap } from "@/components/ui/jobs-map";
import { SourceTag } from "./jobs";
import { formatGBP, formatGBPdec } from "@/lib/format";
import { useMyJobs } from "@/components/jobs-context";
import { JobReportForm } from "./job-report-form";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import {
  fetchChecklist,
  setChecklistItemDone,
  addChecklistItem,
  deleteChecklistItem,
  type ChecklistItem,
} from "@/lib/queries/job-checklist";
import type { MyJob } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

export function JobDrawer({
  jobId,
  onClose,
  onShowToast,
}: {
  jobId: string;
  onClose: () => void;
  onShowToast: ShowToast;
}) {
  const { jobs, refresh } = useMyJobs();
  const job = jobs.find((j) => j.id === jobId); // real jobs only; unknown id → drawer closed
  const [tab, setTab] = useState("overview");
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);

  const startJob = async () => {
    if (!job) return;
    setStarting(true);
    try {
      const res = await fetch("/api/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.uuid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't start the job");
      refresh(); // re-pull jobs so the drawer + board reflect in_progress (and the OS already has it)
      onShowToast({ icon: "play", text: "Job started — you're on the clock. The office can see it." });
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't start the job" });
    } finally {
      setStarting(false);
    }
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!job) return null;

  const statusTone: Record<string, string> = {
    scheduled: "scheduled",
    in_progress: "in_progress",
    final_check: "final_check",
    cancelled: "cancelled",
    completed: "completed",
  };

  const progressTotal =
    (job.checklistDone || 0) +
    Math.min(2, job.beforePhotos || 0) +
    Math.min(2, job.afterPhotos || 0) +
    (job.notesAdded ? 2 : 0) +
    (job.signed ? 3 : 0);
  const progressMax = (job.checklistTotal || 0) + 2 + 2 + 2 + 3;
  const progress = Math.min(1, progressTotal / progressMax);

  const tabs = [
    { id: "overview", label: "Overview", icon: "layout-grid" },
    { id: "signoff", label: "Report", icon: "file-text" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, animation: closing ? "fx-fade-in 200ms reverse" : "fx-fade-in 200ms" }}>
      <div onClick={handleClose} style={{ position: "absolute", inset: 0, background: "rgba(2,0,64,0.48)", backdropFilter: "blur(4px)" }} />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 720,
          maxWidth: "94vw",
          background: T.white,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-24px 0 48px rgba(2,0,64,0.16)",
          animation: closing
            ? "fx-slide-right 200ms cubic-bezier(0.2,0,0,1) reverse"
            : "fx-slide-right 220ms cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div style={{ borderBottom: `1px solid ${T.line}`, background: T.white }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <IconButton icon="x" size={32} tone="ghost" onClick={handleClose} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.mute }}>
                <span className="fx-mono">{job.id}</span>
                <span>·</span>
                <SourceTag source={job.source} />
                <span>·</span>
                <span>{job.customer.name}</span>
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 500,
                  color: T.navy,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {job.title}
              </div>
            </div>
            <Badge
              tone={statusTone[job.status]}
              icon={
                job.status === "in_progress"
                  ? "loader"
                  : job.status === "final_check"
                    ? "pen-line"
                    : job.status === "completed"
                      ? "check"
                      : "clock"
              }
            >
              {STATUS_LABELS[job.status]}
            </Badge>
            <IconButton icon="more-horizontal" size={32} tone="ghost" />
          </div>

          {job.status === "in_progress" && (
            <div style={{ padding: "10px 20px", background: T.coralTint, color: T.coral, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral, animation: "fx-pulse 1.6s ease-in-out infinite" }} />
              <span>
                <b style={{ fontWeight: 600 }}>You&apos;re on the clock.</b> Started 09:42 ·{" "}
                <span className="fx-mono">{job.elapsed}</span> elapsed.
              </span>
              <span style={{ flex: 1 }} />
              <button
                style={{
                  background: T.white,
                  color: T.coral,
                  border: `1px solid ${T.coral}`,
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Pause timer
              </button>
            </div>
          )}
          {job.status === "final_check" && (
            <div style={{ padding: "10px 20px", background: T.amber50, color: T.amber, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <Icon name="hourglass" size={14} />
              <span>
                <b style={{ fontWeight: 600 }}>Waiting on {job.customer.name.split(" ")[0]} to sign.</b> Link sent 22 May 12:24.
              </span>
              <span style={{ flex: 1 }} />
              <button
                style={{
                  background: T.white,
                  color: T.amber,
                  border: `1px solid ${T.amber}`,
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Resend link
              </button>
            </div>
          )}

          <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ padding: "0 12px", borderBottom: "none" }} />
        </div>

        <div style={{ flex: 1, overflow: "auto", background: T.paper }}>
          {tab === "overview" && <OverviewTab job={job} />}
          {tab === "checklist" && <ChecklistTab job={job} />}
          {tab === "photos" && <PhotosTab job={job} />}
          {tab === "notes" && <NotesTab job={job} />}
          {tab === "signoff" && <JobReportForm job={job} onShowToast={onShowToast} onClose={handleClose} />}
        </div>

        <div
          style={{
            borderTop: `1px solid ${T.line}`,
            background: T.white,
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 11.5, color: T.mute, letterSpacing: 0.3 }}>JOB PROGRESS</span>
              <span style={{ fontSize: 11.5, color: T.ink, fontFamily: T.mono }}>{Math.round(progress * 100)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 9999, background: T.line, overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress * 100}%`,
                  height: "100%",
                  background: progress === 1 ? T.green : T.coral,
                  transition: `width 200ms ${T.ease}`,
                }}
              />
            </div>
          </div>
          {job.status === "scheduled" && (
            <Button variant="primary" icon="play" size="lg" onClick={startJob} disabled={starting}>
              {starting ? "Starting…" : "Start job"}
            </Button>
          )}
          {job.status === "in_progress" && (
            <Button variant="primary" icon="send" size="lg" onClick={() => setTab("signoff")}>
              Continue to report
            </Button>
          )}
          {job.status === "final_check" && (
            <Button variant="primary" icon="send" size="lg" onClick={() => setTab("signoff")}>
              Open sign-off
            </Button>
          )}
          {job.status === "completed" && (
            <Button variant="success" icon="check" size="lg" disabled>
              Completed
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// OVERVIEW TAB — mirrors Fixfy OS job card (map, client, schedule, scope, pay).
// ============================================================
function OverviewTab({ job }: { job: MyJob }) {
  const mapsQuery = encodeURIComponent(job.customer.address || job.customer.postcode || job.postcode);
  const googleMapsHref = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}` : undefined;
  const wazeHref = mapsQuery ? `https://waze.com/ul?q=${mapsQuery}` : undefined;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            minHeight: 220,
            borderBottom: `1px solid ${T.line}`,
          }}
        >
          <div style={{ position: "relative", minHeight: 220, borderRight: `1px solid ${T.line}` }}>
            {typeof job.lat === "number" && typeof job.lng === "number" ? (
              <JobsMap jobs={[job]} onOpenJob={() => {}} minHeight={220} />
            ) : (
              <div style={{ position: "relative", height: "100%", minHeight: 220 }}>
                <MapBackground />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    textAlign: "center",
                    fontSize: 12,
                    color: T.mute,
                    background: "rgba(255,255,255,0.72)",
                  }}
                >
                  Location not mapped yet — use the address below for directions.
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span className="fx-mono" style={{ fontSize: 11, color: T.mute }}>
                {job.id}
              </span>
              <SourceTag source={job.source} />
            </div>

            {job.title ? (
              <div
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: T.paper2,
                  border: `1px solid ${T.line}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.navy,
                  maxWidth: "100%",
                }}
              >
                <Icon name="wrench" size={12} color={T.blue} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
              </div>
            ) : null}

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{job.customer.name}</div>
              <div style={{ fontSize: 12.5, color: T.slate, marginTop: 4, lineHeight: 1.45 }}>{job.customer.address || "—"}</div>
              {job.customer.postcode ? (
                <div className="fx-mono" style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>
                  {job.customer.postcode}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: T.slate }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="calendar" size={13} color={T.mute} />
                {job.scheduleStartLabel || job.scheduled?.split(",")[0] || "Visit date not set"}
              </span>
              {job.scheduleArrivalLabel ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="clock" size={13} color={T.mute} />
                  Arrival {job.scheduleArrivalLabel}
                </span>
              ) : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Badge tone={job.pricingMode === "hourly" ? "in_progress" : "scheduled"} size="sm">
                {job.pricingMode === "hourly" ? "Hourly" : "Fixed price"}
              </Badge>
              <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.navy }}>{formatGBPdec(job.total)}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
              {googleMapsHref ? (
                <Button variant="secondary" size="sm" icon="navigation" onClick={() => window.open(googleMapsHref, "_blank", "noopener,noreferrer")}>
                  Google Maps
                </Button>
              ) : null}
              {wazeHref ? (
                <Button variant="secondary" size="sm" icon="navigation" onClick={() => window.open(wazeHref, "_blank", "noopener,noreferrer")}>
                  Waze
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 18px", background: T.paper2, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.navy, textTransform: "uppercase" }}>Schedule</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <OsMiniTile label="Start date" value={job.scheduleStartLabel || "—"} />
            <OsMiniTile label="Expected finish" value={job.scheduleFinishLabel || "—"} />
            <OsMiniTile label="Arrival window" value={job.scheduleArrivalLabel || "—"} />
            <OsMiniTile label="Estimated duration" value={job.durationEst || "—"} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <AccessFlag label="CCZ" active={!!job.inCcz} activeHint="Congestion Charge Zone — plan for charges." inactiveHint="Not in CCZ." />
            <AccessFlag label="Parking" active={!!job.hasFreeParking} activeHint="Free parking on site." inactiveHint="No free parking flagged." />
          </div>

          {job.elapsed ? (
            <div
              style={{
                padding: "10px 12px",
                background: T.coralTint,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: T.coral,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: T.coral, animation: "fx-pulse 1.6s ease-in-out infinite" }} />
              On the clock · <span className="fx-mono" style={{ fontWeight: 600 }}>{job.elapsed}</span> elapsed
            </div>
          ) : null}
        </div>
      </Card>

      <DrawerSection title="Scope" icon="file-text">
        {job.desc?.trim() ? (
          <div style={{ fontSize: 13.5, color: T.slate, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{job.desc}</div>
        ) : (
          <p style={{ fontSize: 13, color: T.mute, fontStyle: "italic", margin: 0 }}>No scope on this job yet.</p>
        )}
      </DrawerSection>

      {job.accessNotes?.trim() ? (
        <DrawerSection title="Access notes" icon="key">
          <div style={{ fontSize: 13.5, color: T.slate, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{job.accessNotes}</div>
        </DrawerSection>
      ) : null}

      {job.referencePhotos && job.referencePhotos.length > 0 ? (
        <DrawerSection title="Site reference photos" icon="image">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
            {job.referencePhotos.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.line}`, aspectRatio: "1" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
          </div>
        </DrawerSection>
      ) : null}

      <DrawerSection title="Your pay" icon="banknote">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
            <PaymentLine label="Labour" value={formatGBPdec(job.labour)} />
            {job.materials > 0 ? <PaymentLine label="Materials" value={formatGBPdec(job.materials)} /> : null}
            {job.vat ? <PaymentLine label="VAT (included)" value="" sub /> : null}
            <div style={{ height: 1, background: T.line, marginTop: 4 }} />
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 500 }}>Total payout</span>
              <span style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.navy }}>{formatGBPdec(job.total)}</span>
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px",
              background: T.paper2,
              borderRadius: 10,
              fontSize: 11.5,
              color: T.slate,
              lineHeight: 1.5,
              maxWidth: 220,
            }}
          >
            Partner payout via self-bill <b style={{ color: T.ink }}>Net-7</b> after job sign-off.
          </div>
        </div>
      </DrawerSection>
    </div>
  );
}

function OsMiniTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ padding: "10px 12px", background: T.white, borderRadius: 10, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, color: T.navy, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{value}</div>
    </div>
  );
}

function AccessFlag({
  label,
  active,
  activeHint,
  inactiveHint,
}: {
  label: string;
  active: boolean;
  activeHint: string;
  inactiveHint: string;
}) {
  return (
    <span
      title={active ? activeHint : inactiveHint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        border: `1px solid ${active ? T.green : T.line}`,
        background: active ? "rgba(15,110,86,0.08)" : T.white,
        color: active ? T.green : T.mute,
      }}
    >
      <Icon name={active ? "check" : "x"} size={12} />
      {label}
    </span>
  );
}

function PaymentLine({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ flex: 1, fontSize: 13, color: sub ? T.mute : T.slate }}>{label}</span>
      {value && <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>{value}</span>}
    </div>
  );
}

function DrawerSection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={14} color={T.mute} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.navy }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </Card>
  );
}

// ============================================================
// CHECKLIST TAB
// ============================================================
function ChecklistTab({ job }: { job: MyJob }) {
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchChecklist(createClient(), job.uuid);
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.uuid]);

  const done = items.filter((i) => i.done).length;
  const requiredLeft = items.filter((i) => i.required && !i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const toggle = async (item: ChecklistItem) => {
    const next = !item.done;
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, done: next } : p)));
    try {
      await setChecklistItemDone(createClient(), item.id, next);
    } catch (e) {
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, done: item.done } : p))); // revert
      toast({ text: e instanceof Error ? e.message : "Couldn't update step", icon: "alert-triangle", tone: "coral" });
    }
  };

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      const created = await addChecklistItem(createClient(), job.uuid, label, items.length);
      setItems((prev) => [...prev, created]);
      setNewLabel("");
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't add step", icon: "alert-triangle", tone: "coral" });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (item: ChecklistItem) => {
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    try {
      await deleteChecklistItem(createClient(), item.id);
    } catch {
      setItems((prev) => [...prev, item].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: T.mute }}>Job checklist</div>
          <div style={{ fontSize: 17, fontWeight: 500, color: T.navy, marginTop: 2 }}>
            {done} of {items.length} done
          </div>
          <div
            style={{
              fontSize: 12,
              color: requiredLeft > 0 ? T.amber : T.green,
              marginTop: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name={requiredLeft > 0 ? "alert-triangle" : "check-circle-2"} size={12} />
            {items.length === 0
              ? "No steps yet — add what this job needs."
              : requiredLeft > 0
                ? `${requiredLeft} required step${requiredLeft === 1 ? "" : "s"} remaining`
                : "All required steps complete"}
          </div>
        </div>
        <div style={{ position: "relative", width: 76, height: 76 }}>
          <svg width="76" height="76">
            <circle cx="38" cy="38" r="32" stroke={T.line} strokeWidth="6" fill="none" />
            <circle
              cx="38"
              cy="38"
              r="32"
              stroke={T.coral}
              strokeWidth="6"
              fill="none"
              strokeDasharray={2 * Math.PI * 32}
              strokeDashoffset={items.length ? 2 * Math.PI * 32 * (1 - done / items.length) : 2 * Math.PI * 32}
              strokeLinecap="round"
              transform="rotate(-90 38 38)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 500,
              color: T.navy,
            }}
          >
            {pct}%
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading checklist…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <ChecklistItemRow key={it.id} item={it} onToggle={() => toggle(it)} onRemove={() => remove(it)} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a step…"
          style={{ flex: 1, height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: T.sans, fontSize: 13, color: T.ink, outline: "none" }}
        />
        <Button variant="secondary" icon="plus" size="sm" onClick={add} disabled={adding || !newLabel.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function ChecklistItemRow({ item, onToggle, onRemove }: { item: ChecklistItem; onToggle: () => void; onRemove: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: T.white,
        border: `1px solid ${h ? T.lineStrong : T.line}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: `all 120ms ${T.ease}`,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          flexShrink: 0,
          border: `1.5px solid ${item.done ? T.green : T.lineStrong}`,
          background: item.done ? T.green : T.white,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {item.done && <Icon name="check" size={13} color={T.white} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            color: item.done ? T.mute : T.ink,
            fontWeight: 500,
            textDecoration: item.done ? "line-through" : "none",
            textDecorationColor: T.line,
          }}
        >
          {item.label}
          {item.required && (
            <span style={{ marginLeft: 6, fontSize: 10, color: T.amber, letterSpacing: 0.3, fontWeight: 600 }}>REQ</span>
          )}
        </div>
        {item.note && (
          <div
            style={{
              fontSize: 12,
              color: T.slate,
              marginTop: 4,
              padding: "6px 10px",
              background: T.paper,
              borderRadius: 6,
              fontFamily: T.mono,
            }}
          >
            {item.note}
          </div>
        )}
      </div>
      {!item.required && h && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove step"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: T.mute, padding: 2, marginTop: 1 }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// PHOTOS TAB
// ============================================================
interface JobPhoto {
  id: string;
  url: string | null;
}

function PhotosTab({ job }: { job: MyJob }) {
  const toast = useToast();
  const reference = job.referencePhotos ?? [];
  const [before, setBefore] = useState<JobPhoto[]>([]);
  const [after, setAfter] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<"before" | "after" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/photos?jobId=${encodeURIComponent(job.uuid)}`);
      const json = await res.json();
      if (res.ok) {
        const photos = (json.photos ?? []) as { id: string; kind: "before" | "after"; url: string | null }[];
        setBefore(photos.filter((p) => p.kind === "before"));
        setAfter(photos.filter((p) => p.kind === "after"));
      }
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.uuid]);

  const upload = async (kind: "before" | "after", file: File) => {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.append("jobId", job.uuid);
      fd.append("kind", kind);
      fd.append("file", file);
      const res = await fetch("/api/jobs/photos", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const photo: JobPhoto = { id: json.id, url: json.url };
      (kind === "before" ? setBefore : setAfter)((prev) => [...prev, photo]);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Upload failed", icon: "alert-triangle", tone: "coral" });
    } finally {
      setUploading(null);
    }
  };

  const remove = async (kind: "before" | "after", id: string) => {
    const setter = kind === "before" ? setBefore : setAfter;
    setter((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/jobs/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      void load();
    }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      {reference.length > 0 && (
        <Card style={{ padding: 0 }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="image" size={14} color={T.navy} />
            <span style={{ fontSize: 13, fontWeight: 500, color: T.navy }}>Site reference photos</span>
            <Badge tone="neutral" size="sm">{reference.length}</Badge>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: T.mute }}>From the job brief</span>
          </div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {reference.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Reference ${i + 1}`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
              </a>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading photos…
        </div>
      ) : (
        <>
          <PhotoGroup title="Before" required={2} tone={T.blue} photos={before} uploading={uploading === "before"} onPick={(f) => upload("before", f)} onRemove={(id) => remove("before", id)} />
          <PhotoGroup title="After" required={2} tone={T.green} photos={after} uploading={uploading === "after"} onPick={(f) => upload("after", f)} onRemove={(id) => remove("after", id)} />
        </>
      )}
    </div>
  );
}

function PhotoGroup({
  title,
  required,
  tone,
  photos,
  uploading,
  onPick,
  onRemove,
}: {
  title: string;
  required: number;
  tone: string;
  photos: JobPhoto[];
  uploading: boolean;
  onPick: (f: File) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: tone }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: T.navy }}>{title}</span>
        <Badge tone={photos.length >= required ? "success" : "warning"} size="sm">
          {photos.length} of min {required}
        </Badge>
        <span style={{ flex: 1 }} />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" size="sm" icon="upload" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Add photo"}
        </Button>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {photos.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: T.mute }}>No {title.toLowerCase()} photos yet.</div>}
        {photos.map((p) => (
          <PhotoTile key={p.id} url={p.url} onRemove={() => onRemove(p.id)} />
        ))}
      </div>
    </Card>
  );
}

function PhotoTile({ url, onRemove }: { url: string | null; onRemove: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", position: "relative", background: T.paper2, border: `1px solid ${T.line}` }}
    >
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Job photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </a>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.mute }}>
          <Icon name="image" size={20} />
        </div>
      )}
      {h && (
        <button
          onClick={onRemove}
          aria-label="Remove photo"
          style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(2,0,64,0.6)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// NOTES TAB
// ============================================================
function NotesTab({ job }: { job: MyJob }) {
  const [workNotes, setWorkNotes] = useState(job.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(job.internalNotesText ?? "");
  const [followFlag, setFollowFlag] = useState(false);

  const textareaStyle: CSSProperties = {
    width: "100%",
    padding: 14,
    border: "none",
    outline: "none",
    fontFamily: T.sans,
    fontSize: 13.5,
    color: T.ink,
    lineHeight: 1.55,
    resize: "vertical",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="eye" size={14} color={T.coral} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.navy }}>Work notes</span>
          <span style={{ fontSize: 11, color: T.mute }}>Visible to customer on the final report</span>
        </div>
        <textarea
          value={workNotes}
          onChange={(e) => setWorkNotes(e.target.value)}
          placeholder="What did you do, what did you find, what should the customer know…"
          style={{ ...textareaStyle, minHeight: 120 }}
        />
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="lock" size={14} color={T.mute} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.navy }}>Internal notes</span>
          <span style={{ fontSize: 11, color: T.mute }}>Only Fixfy team can see</span>
        </div>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          placeholder="Anything for the dispatcher or future you — access quirks, customer mood, things to remember…"
          style={{ ...textareaStyle, minHeight: 90 }}
        />
      </Card>

      <DrawerSection title="Follow-up flags" icon="flag">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ToggleRow
            on={followFlag}
            onChange={setFollowFlag}
            label="Customer should book a follow-up"
            hint="Sends a reminder email 3 months from completion"
          />
          <div style={{ padding: 12, background: T.amber50, borderRadius: 8 }}>
            <ToggleRow
              on={false}
              onChange={() => {}}
              label="Additional work spotted (out of scope)"
              hint="Opens a mini-form to request a new quote — basin drip, upstairs"
            />
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px dashed ${T.amber}`,
                fontSize: 12,
                color: T.amber,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="zap" size={12} />
              <span>You can quote any additional work spotted on-site for 0% commission.</span>
            </div>
          </div>
        </div>
      </DrawerSection>
    </div>
  );
}

function ToggleRow({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{hint}</div>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

