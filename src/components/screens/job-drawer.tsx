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
  Avatar,
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
import { SourceTag } from "./jobs";
import { formatGBP, formatGBPdec } from "@/lib/format";
import { useMyJobs } from "@/components/jobs-context";
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
  const { jobs } = useMyJobs();
  const job = jobs.find((j) => j.id === jobId); // real jobs only; unknown id → drawer closed
  const [tab, setTab] = useState("overview");
  const [closing, setClosing] = useState(false);

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
    { id: "checklist", label: "Checklist", icon: "check-square", count: `${job.checklistDone}/${job.checklistTotal}` },
    { id: "photos", label: "Photos", icon: "image", count: (job.beforePhotos || 0) + (job.afterPhotos || 0) },
    { id: "notes", label: "Notes", icon: "pencil" },
    { id: "signoff", label: "Sign-off", icon: "pen-line" },
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
          {tab === "signoff" && <SignoffTab job={job} onShowToast={onShowToast} onClose={handleClose} />}
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
          {job.status === "scheduled" && <Button variant="primary" icon="play" size="lg">Start job</Button>}
          {job.status === "in_progress" && (
            <Button variant="dark" icon="check" size="lg" disabled={progress < 1}>
              {progress < 1 ? `${job.checklistTotal - job.checklistDone} steps to go` : "Mark complete"}
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
// OVERVIEW TAB
// ============================================================
function OverviewTab({ job }: { job: MyJob }) {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar initials={job.customer.initials} size={44} bg={T.navy} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.ink }}>{job.customer.name}</div>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
            {job.customer.priorJobs > 0
              ? `Returning customer · ${job.customer.priorJobs} prior job${job.customer.priorJobs === 1 ? "" : "s"} with you`
              : "New customer · first job"}
          </div>
        </div>
        <Button variant="secondary" size="sm" icon="phone">Call</Button>
        <Button variant="secondary" size="sm" icon="message-square">Message</Button>
      </Card>

      <DrawerSection title="Location & access" icon="map-pin">
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{job.customer.address}</div>
              <div className="fx-mono" style={{ fontSize: 12.5, color: T.slate, marginTop: 2 }}>
                {job.customer.postcode}
              </div>
              <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{job.distance} mi · ETA 9 min</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.mute, letterSpacing: 0.3, marginBottom: 4 }}>ACCESS NOTES</div>
              <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5 }}>{job.accessNotes}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.mute, letterSpacing: 0.3, marginBottom: 4 }}>PARKING</div>
              <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5 }}>{job.parkingNotes}</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button variant="secondary" size="sm" icon="navigation">Google Maps</Button>
              <Button variant="secondary" size="sm" icon="navigation">Waze</Button>
            </div>
          </div>
          <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.line}`, minHeight: 200, position: "relative", background: "#E8EAF0" }}>
            <MapBackground />
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)" }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50% 50% 50% 0",
                  transform: "rotate(-45deg)",
                  background: T.coral,
                  border: `3px solid ${T.white}`,
                  boxShadow: "0 4px 8px rgba(2,0,64,0.3)",
                }}
              />
            </div>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Job description" icon="file-text">
        <div style={{ fontSize: 13.5, color: T.slate, lineHeight: 1.55 }}>{job.desc}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <ScopeList
            title="In scope"
            tone={T.green}
            items={["Annual service per manufacturer schedule", "Combustion analysis recording", "Issue Gas Safe service record"]}
          />
          <ScopeList title="Out of scope" tone={T.mute} items={["Parts replacement (quote separately)", "System power-flush"]} />
        </div>
      </DrawerSection>

      <DrawerSection title="Schedule" icon="calendar">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <MiniStat label="Date" value="Fri 23 May" />
          <MiniStat label="Window" value="09:30 – 11:30" />
          <MiniStat label="Estimated" value={job.durationEst} />
        </div>
        {job.elapsed && (
          <div
            style={{
              marginTop: 10,
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
            Started 09:42 · <span className="fx-mono" style={{ fontWeight: 600 }}>{job.elapsed}</span> elapsed
          </div>
        )}
      </DrawerSection>

      <DrawerSection
        title="Materials supplied"
        icon="package"
        action={<Button variant="ghost" size="sm" icon="plus">Add unplanned</Button>}
      >
        <div style={{ borderTop: `1px solid ${T.line}` }}>
          {[
            { item: "Boiler service kit (filter, gasket, condensate)", qty: 1, cost: 18.5 },
            { item: "Inhibitor (1L)", qty: 1, cost: 12.0 },
            { item: "Magnetic filter clean cartridge", qty: 1, cost: 4.5 },
          ].map((m, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 80px",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: `1px solid ${T.line}`,
                fontSize: 13,
              }}
            >
              <div style={{ color: T.ink }}>{m.item}</div>
              <div style={{ color: T.mute, textAlign: "right", fontFamily: T.mono }}>×{m.qty}</div>
              <div style={{ fontFamily: T.mono, textAlign: "right", color: T.ink }}>{formatGBPdec(m.cost)}</div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", padding: "12px 0" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: T.mute }}>3 items</span>
            <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 500 }}>£35.00</span>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Payment" icon="banknote">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <PaymentLine label="Labour" value={formatGBPdec(job.labour)} />
            <PaymentLine label="Materials" value={formatGBPdec(job.materials)} />
            <PaymentLine label="VAT (included)" value="" sub />
            <div style={{ height: 1, background: T.line, marginTop: 4 }} />
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 500 }}>Total</span>
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
              textAlign: "right",
            }}
          >
            Paid via self-bill <b style={{ color: T.ink }}>Net-7</b> from sign-off.
            <br />
            Next batch <span className="fx-mono">Fri 29 May</span>.
          </div>
        </div>
      </DrawerSection>
    </div>
  );
}

function ScopeList({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div style={{ padding: 12, background: T.white, borderRadius: 8, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 11, color: tone, letterSpacing: 0.4, fontWeight: 500, marginBottom: 8, textTransform: "uppercase" }}>
        {title}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: T.slate, marginTop: i === 0 ? 0 : 4, lineHeight: 1.4 }}>
          <Icon name={tone === T.green ? "check" : "x"} size={13} color={tone} style={{ marginTop: 2 }} />
          <span>{it}</span>
        </div>
      ))}
    </div>
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

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ padding: 10, background: T.white, borderRadius: 8, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 10.5, color: T.mute, letterSpacing: 0.3, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{value}</div>
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

// ============================================================
// SIGN-OFF TAB
// ============================================================
function SignoffTab({ job, onShowToast, onClose }: { job: MyJob; onShowToast: ShowToast; onClose: () => void }) {
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = padRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = T.navy;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (job.signed) {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.55);
      ctx.bezierCurveTo(w * 0.22, h * 0.2, w * 0.32, h * 0.85, w * 0.4, h * 0.5);
      ctx.bezierCurveTo(w * 0.48, h * 0.15, w * 0.55, h * 0.85, w * 0.66, h * 0.45);
      ctx.bezierCurveTo(w * 0.75, h * 0.3, w * 0.82, h * 0.7, w * 0.88, h * 0.55);
      ctx.stroke();
      setHasInk(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = padRef.current!;
    const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = padRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = padRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = padRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <DrawerSection title="Pre-flight" icon="list-checks">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ValidationRow ok={job.checklistDone === job.checklistTotal} label={`Checklist complete · ${job.checklistDone}/${job.checklistTotal}`} />
          <ValidationRow ok={job.beforePhotos >= 2} label={`Before photos · ${job.beforePhotos} of min 2`} />
          <ValidationRow ok={job.afterPhotos >= 2} label={`After photos · ${job.afterPhotos} of min 2`} />
          <ValidationRow ok={!!job.notesAdded} label="Work notes added" />
          <ValidationRow ok={hasInk} label="Customer signature captured" />
        </div>
      </DrawerSection>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="pen-line" size={14} color={T.mute} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.navy }}>{job.customer.name}&apos;s signature</span>
          {hasInk && (
            <Button variant="ghost" size="sm" icon="rotate-ccw" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          <canvas
            ref={padRef}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
            style={{
              display: "block",
              width: "100%",
              height: 180,
              background: T.paper,
              borderRadius: 10,
              border: `1.5px dashed ${T.line}`,
              cursor: "crosshair",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11.5, color: T.mute }}>By signing, {job.customer.name} accepts the work as complete.</span>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" icon="link">Send sign-off link instead</Button>
          </div>
          {hasInk && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 10px",
                background: T.green50,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: T.green,
              }}
            >
              <Icon name="shield-check" size={12} />
              <span>
                <b>Audit captured.</b> <span className="fx-mono">23 May 2026, 11:14 UTC · 81.2.140.18</span>
              </span>
            </div>
          )}
        </div>
      </Card>

      {job.rating && (
        <DrawerSection title="Customer rating" icon="star">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon key={i} name="star" size={18} color={i < (job.rating ?? 0) ? T.amber : T.line} />
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: T.mute, marginTop: 4 }}>Posted on completion</div>
            </div>
            <div style={{ flex: 1, fontSize: 13, color: T.slate, fontStyle: "italic", lineHeight: 1.5 }}>
              &quot;{job.ratingComment}&quot;
            </div>
          </div>
        </DrawerSection>
      )}

      <Card style={{ padding: 16, background: T.navy, color: T.white, borderColor: T.navy, display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "rgba(255,255,255,0.08)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="send" size={18} color={T.coral} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Submit final report</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.64)", marginTop: 2 }}>
            Generates a PDF, emails it to {job.customer.name} (cc Fixfy), and queues £{job.total.toFixed(2)} for self-bill on Fri 29 May.
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon="send"
          disabled={!hasInk}
          onClick={() => {
            onShowToast({ icon: "check-circle-2", text: `Report sent · £${job.total.toFixed(2)} queued for self-bill on Fri 29 May.` });
            setTimeout(onClose, 600);
          }}
        >
          Submit
        </Button>
      </Card>
    </div>
  );
}

function ValidationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 9999,
          flexShrink: 0,
          background: ok ? T.green : T.line,
          color: T.white,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={ok ? "check" : "minus"} size={11} />
      </span>
      <span style={{ flex: 1, fontSize: 13, color: ok ? T.ink : T.mute }}>{label}</span>
      {!ok && <span style={{ fontSize: 11, color: T.amber, fontWeight: 500 }}>Required</span>}
    </div>
  );
}
