"use client";

// Opportunities — Leads, Available jobs, Available quotes. Ported from opportunities.jsx.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SectionHeader,
  Tabs,
} from "@/components/ui/primitives";
import { formatGBP } from "@/lib/format";
import { PlanUpgradeBanner } from "@/components/billing/plan-upgrade-banner";
import { redactLead, redactAvailableJob, redactQuote } from "@/lib/preview-redact";
import { usePartner } from "@/components/partner-context";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAvailableQuotes } from "@/lib/queries/quotes";
import { QuoteDrawer } from "@/components/screens/quote-drawer";
import { fetchAvailableJobs } from "@/lib/queries/available-jobs";
import {
  LEAD_PIPELINE_ACCENTS,
  LEAD_PIPELINE_LABELS,
  LEAD_PIPELINE_STATUSES,
  pipelineBadgeTone,
  type LeadPipelineStatus,
} from "@/lib/lead-pipeline";

interface PortalLead {
  offerId: string; // lead id (public.leads)
  reference?: string | null;
  status: string;
  pipelineStatus?: LeadPipelineStatus | null;
  contactedAt?: string | null;
  title: string;
  desc: string;
  postcode: string;
  budget: number | null;
  priority: string | null;
  requestKind: string | null;
  posted: string | null;
  contactedCount: number;
  maxContacts: number;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

type LeadTab = "new" | "interested";
type NewLeadView = "list" | "card";
type InterestedLeadView = "kanban" | "list";
const DECLINED_STORAGE_KEY = "fixfy-leads-declined";
const INTERESTED_VIEW_STORAGE_KEY = "fixfy-leads-interested-view";

function loadInterestedView(): InterestedLeadView {
  if (typeof window === "undefined") return "kanban";
  try {
    const raw = localStorage.getItem(INTERESTED_VIEW_STORAGE_KEY);
    return raw === "list" || raw === "kanban" ? raw : "kanban";
  } catch {
    return "kanban";
  }
}

function saveInterestedView(view: InterestedLeadView) {
  try {
    localStorage.setItem(INTERESTED_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

function loadDeclinedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DECLINED_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDeclinedIds(ids: Set<string>) {
  try {
    localStorage.setItem(DECLINED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}
import type { AvailableJob, QuoteRequest, QuoteRequestStatus } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

// ============================================================
// LEADS
// ============================================================
export function LeadsView({
  onShowToast,
  previewMode = false,
  redactSensitive = false,
}: {
  onShowToast: ShowToast;
  previewMode?: boolean;
  redactSensitive?: boolean;
}) {
  const [leads, setLeads] = useState<PortalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pipelineBusyId, setPipelineBusyId] = useState<string | null>(null);
  const [notesSavingId, setNotesSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<LeadTab>("new");
  const [newView, setNewView] = useState<NewLeadView>("list");
  const [interestedView, setInterestedView] = useState<InterestedLeadView>(loadInterestedView);
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(() => loadDeclinedIds());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load leads");
      setLeads((json.leads ?? []) as PortalLead[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleLeads = useMemo(
    () => leads.filter((l) => !declinedIds.has(l.offerId)),
    [leads, declinedIds],
  );
  const newLeads = useMemo(() => visibleLeads.filter((l) => l.status !== "contacted"), [visibleLeads]);
  const interestedLeads = useMemo(() => visibleLeads.filter((l) => l.status === "contacted"), [visibleLeads]);
  const activeLeads = tab === "new" ? newLeads : interestedLeads;

  const act = async (lead: PortalLead, status: "contacted" | "declined") => {
    if (previewMode) return;
    setBusyId(lead.offerId);
    try {
      const res = await fetch("/api/leads/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.offerId, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't update lead");

      if (status === "declined") {
        const next = new Set(declinedIds);
        next.add(lead.offerId);
        setDeclinedIds(next);
        saveDeclinedIds(next);
        onShowToast({ icon: "x", text: "Lead declined — removed from New." });
        return;
      }

      const contact = json.contact ?? {};
      setLeads((prev) =>
        prev.map((l) =>
          l.offerId === lead.offerId
            ? {
                ...l,
                status: "contacted",
                pipelineStatus: "contacted",
                contactedAt: new Date().toISOString(),
                contactedCount: l.contactedCount + 1,
                email: contact.email,
                phone: contact.phone,
                address: contact.address,
              }
            : l,
        ),
      );
      onShowToast({ icon: "user-check", text: "Marked as interested — find it in Interested." });
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't update lead" });
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async (lead: PortalLead, notes: string) => {
    setNotesSavingId(lead.offerId);
    try {
      const res = await fetch("/api/leads/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.offerId, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save notes");
      const trimmed = notes.trim() || null;
      setLeads((prev) =>
        prev.map((l) => (l.offerId === lead.offerId ? { ...l, notes: trimmed } : l)),
      );
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't save notes" });
      throw e;
    } finally {
      setNotesSavingId(null);
    }
  };

  const updatePipeline = async (lead: PortalLead, pipelineStatus: LeadPipelineStatus) => {
    setPipelineBusyId(lead.offerId);
    try {
      const res = await fetch("/api/leads/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.offerId, pipelineStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't update status");
      setLeads((prev) =>
        prev.map((l) => (l.offerId === lead.offerId ? { ...l, pipelineStatus } : l)),
      );
      onShowToast({ icon: "check", text: `Marked as ${LEAD_PIPELINE_LABELS[pipelineStatus]}` });
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't update status" });
    } finally {
      setPipelineBusyId(null);
    }
  };

  const newViewTabs = [
    { id: "list", label: "List", icon: "list" },
    { id: "card", label: "Cards", icon: "layout-grid" },
  ];
  const interestedViewTabs = [
    { id: "kanban", label: "Stages", icon: "columns-3" },
    { id: "list", label: "List", icon: "list" },
  ];
  const setInterestedViewPersisted = (view: InterestedLeadView) => {
    setInterestedView(view);
    saveInterestedView(view);
  };

  const leadTabs = [
    { id: "new", label: "New", icon: "user-plus", count: newLeads.length || undefined },
    { id: "interested", label: "Interested", icon: "phone", count: interestedLeads.length || undefined },
  ];

  const displayLead = (lead: PortalLead) => (redactSensitive ? redactLead(lead) : lead);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, flex: 1, overflow: "auto" }}>
      <SectionHeader
        title="Leads"
        subtitle="Customer enquiries Fixfy has sent your way. Reach out fast — first contact wins the work."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {tab === "new" && (
              <Tabs tabs={newViewTabs} active={newView} onChange={(id) => setNewView(id as NewLeadView)} variant="pills" />
            )}
            <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      {!loading && !error && visibleLeads.length > 0 && (
        <Tabs tabs={leadTabs} active={tab} onChange={(id) => setTab(id as LeadTab)} variant="pills" />
      )}

      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading leads…
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 13, color: T.coral }}>{error}</div>
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
            Retry
          </Button>
        </div>
      ) : visibleLeads.length === 0 ? (
        <EmptyState icon="user-plus" title="No leads right now" hint="When Fixfy sends a customer enquiry your way, it'll appear here to act on." />
      ) : activeLeads.length === 0 ? (
        <EmptyState
          icon={tab === "new" ? "user-plus" : "phone"}
          title={tab === "new" ? "No new leads" : "No interested leads yet"}
          hint={
            tab === "new"
              ? "You're all caught up. Check Interested for leads you've already unlocked."
              : "Contact a new lead to reveal customer details and track progress here."
          }
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12.5, color: T.mute }}>
              <b style={{ color: T.ink, fontWeight: 500 }}>{activeLeads.length}</b>{" "}
              {tab === "new" ? (activeLeads.length === 1 ? "new lead" : "new leads") : activeLeads.length === 1 ? "interested lead" : "interested leads"}
              {tab === "new" && interestedLeads.length > 0 && (
                <>
                  {" "}
                  · <b style={{ color: T.navy, fontWeight: 500 }}>{interestedLeads.length}</b> in Interested
                </>
              )}
            </div>
            {tab === "interested" && (
              <Tabs
                tabs={interestedViewTabs}
                active={interestedView}
                onChange={(id) => setInterestedViewPersisted(id as InterestedLeadView)}
                variant="pills"
              />
            )}
          </div>
          {tab === "interested" && interestedView === "kanban" ? (
            <LeadKanbanBoard
              leads={interestedLeads.map(displayLead)}
              pipelineBusyId={pipelineBusyId}
              notesSavingId={notesSavingId}
              onPipelineChange={updatePipeline}
              onNotesSave={saveNotes}
            />
          ) : tab === "new" ? (
            newView === "list" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeLeads.map((l) => (
                  <LeadListRow
                    key={l.offerId}
                    lead={displayLead(l)}
                    tab={tab}
                    busy={busyId === l.offerId}
                    onContact={() => act(l, "contacted")}
                    onDecline={() => act(l, "declined")}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                {activeLeads.map((l) => (
                  <LeadCardCompact
                    key={l.offerId}
                    lead={displayLead(l)}
                    tab={tab}
                    busy={busyId === l.offerId}
                    pipelineBusy={pipelineBusyId === l.offerId}
                    notesSaving={notesSavingId === l.offerId}
                    onContact={() => act(l, "contacted")}
                    onDecline={() => act(l, "declined")}
                    onPipelineChange={(s) => updatePipeline(l, s)}
                    onNotesSave={(notes) => saveNotes(l, notes)}
                  />
                ))}
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeLeads.map((l) => (
                <LeadListRow
                  key={l.offerId}
                  lead={displayLead(l)}
                  tab={tab}
                  busy={busyId === l.offerId}
                  onContact={() => act(l, "contacted")}
                  onDecline={() => act(l, "declined")}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function FilterPill({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${T.line}`,
        background: T.white,
        cursor: "pointer",
        fontFamily: T.sans,
        fontSize: 12.5,
        fontWeight: 400,
        color: T.slate,
      }}
    >
      <Icon name={icon} size={13} color={T.mute} />
      {label}
      <Icon name="chevron-down" size={12} color={T.mute} />
    </button>
  );
}

function leadTiming(priority: string | null, kind: string | null): { label: string; emergency: boolean } {
  const p = (priority ?? "").toLowerCase();
  if (/urgent|emergency|high/.test(p)) return { label: "Urgent", emergency: true };
  if (kind === "work") return { label: "Ready to book", emergency: false };
  if (kind === "quote") return { label: "Wants a quote", emergency: false };
  return { label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "Flexible", emergency: false };
}
function leadPosted(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function PipelineStatusPicker({
  value,
  busy,
  onChange,
  compact,
}: {
  value: LeadPipelineStatus;
  busy: boolean;
  onChange: (s: LeadPipelineStatus) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: compact ? 4 : 6, flexWrap: "wrap" }}>
      {LEAD_PIPELINE_STATUSES.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onChange(s)}
            style={{
              padding: compact ? "4px 8px" : "5px 10px",
              borderRadius: 6,
              border: `1px solid ${active ? T.navy : T.line}`,
              background: active ? T.navy : T.white,
              color: active ? T.white : T.slate,
              fontFamily: T.sans,
              fontSize: compact ? 11 : 11.5,
              fontWeight: active ? 600 : 400,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {LEAD_PIPELINE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

function LeadNotesField({
  value,
  saving,
  onSave,
  compact,
}: {
  value: string;
  saving: boolean;
  onSave: (notes: string) => Promise<void>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const persist = async () => {
    if (draft === value) return;
    try {
      await onSave(draft);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      setDraft(value);
    }
  };

  return (
    <div
      data-lead-notes
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10.5, color: T.mute, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="file-text" size={11} /> Notes
        </span>
        {(saving || savedFlash) && (
          <span style={{ fontSize: 10.5, color: saving ? T.mute : T.green }}>
            {saving ? "Saving…" : "Saved"}
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void persist()}
        placeholder="Call notes, follow-up reminders…"
        rows={compact ? 2 : 3}
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: compact ? 52 : 64,
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${T.line}`,
          background: T.paper,
          fontFamily: T.sans,
          fontSize: 12,
          lineHeight: 1.45,
          color: T.ink,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function LeadContactStrip({ lead, inline }: { lead: PortalLead; inline?: boolean }) {
  if (!lead.phone && !lead.email) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: inline ? 10 : 8, flexWrap: "wrap" }}>
      {lead.phone && (
        <a href={`tel:${lead.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500, color: T.ink, textDecoration: "none" }}>
          <Icon name="phone" size={12} color={T.green} /> {lead.phone}
        </a>
      )}
      {lead.email && (
        <a href={`mailto:${lead.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: T.slate, textDecoration: "none" }}>
          <Icon name="mail" size={12} color={T.coral} /> {lead.email}
        </a>
      )}
    </div>
  );
}

function LeadKanbanBoard({
  leads,
  pipelineBusyId,
  notesSavingId,
  onPipelineChange,
  onNotesSave,
}: {
  leads: PortalLead[];
  pipelineBusyId: string | null;
  notesSavingId: string | null;
  onPipelineChange: (lead: PortalLead, status: LeadPipelineStatus) => void;
  onNotesSave: (lead: PortalLead, notes: string) => Promise<void>;
}) {
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<LeadPipelineStatus | null>(null);

  const byStatus = (status: LeadPipelineStatus) =>
    leads.filter((l) => (l.pipelineStatus ?? "contacted") === status);

  const handleDrop = (status: LeadPipelineStatus) => {
    const lead = leads.find((l) => l.offerId === dragLeadId);
    setDragLeadId(null);
    setDropColumn(null);
    if (!lead || (lead.pipelineStatus ?? "contacted") === status) return;
    onPipelineChange(lead, status);
  };

  return (
    <div className="fx-leads-stages">
      {LEAD_PIPELINE_STATUSES.map((status) => {
        const items = byStatus(status);
        const highlight = dropColumn === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDropColumn(status);
            }}
            onDragLeave={() => setDropColumn((c) => (c === status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              minWidth: 200,
              background: highlight ? T.paper2 : T.paper,
              borderRadius: 12,
              border: `1.5px solid ${highlight ? T.navy : T.line}`,
              transition: `border-color 120ms ${T.ease}`,
            }}
          >
            <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.line}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: LEAD_PIPELINE_ACCENTS[status], flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{LEAD_PIPELINE_LABELS[status]}</span>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 10.5,
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: T.white,
                  color: T.slate,
                  border: `1px solid ${T.line}`,
                }}
              >
                {items.length}
              </span>
            </div>
            <div style={{ padding: 8, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {items.map((lead) => (
                <LeadKanbanCard
                  key={lead.offerId}
                  lead={lead}
                  busy={pipelineBusyId === lead.offerId}
                  notesSaving={notesSavingId === lead.offerId}
                  dragging={dragLeadId === lead.offerId}
                  onDragStart={() => setDragLeadId(lead.offerId)}
                  onDragEnd={() => {
                    setDragLeadId(null);
                    setDropColumn(null);
                  }}
                  onNotesSave={(notes) => onNotesSave(lead, notes)}
                />
              ))}
              {items.length === 0 && (
                <div
                  style={{
                    padding: 16,
                    fontSize: 11.5,
                    color: T.mute,
                    textAlign: "center",
                    border: `1.5px dashed ${T.line}`,
                    borderRadius: 8,
                  }}
                >
                  Drop leads here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadKanbanCard({
  lead,
  busy,
  notesSaving,
  dragging,
  onDragStart,
  onDragEnd,
  onNotesSave,
}: {
  lead: PortalLead;
  busy: boolean;
  notesSaving: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onNotesSave: (notes: string) => Promise<void>;
}) {
  const [h, setH] = useState(false);
  const timing = leadTiming(lead.priority, lead.requestKind);

  return (
    <div
      draggable={!busy}
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: T.white,
        border: `1px solid ${h ? T.lineStrong : T.line}`,
        borderRadius: 10,
        padding: 10,
        cursor: busy ? "wait" : "grab",
        opacity: dragging ? 0.45 : busy ? 0.7 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: h ? "0 1px 3px rgba(2,0,64,0.08)" : "none",
        transition: `box-shadow 120ms ${T.ease}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <Badge tone={timing.emergency ? "coral" : "soft"} size="sm">{timing.label}</Badge>
        {lead.reference && <span style={{ fontSize: 10, color: T.mute, fontFamily: T.mono }}>{lead.reference}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{lead.title}</div>
      {lead.desc && (
        <div style={{ fontSize: 11.5, color: T.slate, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {lead.desc}
        </div>
      )}
      <div style={{ fontSize: 11, color: T.mute, display: "flex", alignItems: "center", gap: 4 }}>
        <Icon name="map-pin" size={10} /> {lead.postcode || "—"}
      </div>
      <LeadContactStrip lead={lead} />
      <LeadNotesField value={lead.notes ?? ""} saving={notesSaving} onSave={onNotesSave} compact />
    </div>
  );
}

function LeadListRow({
  lead,
  tab,
  busy,
  onContact,
  onDecline,
}: {
  lead: PortalLead;
  tab: LeadTab;
  busy: boolean;
  onContact: () => void;
  onDecline: () => void;
}) {
  const contacted = lead.status === "contacted";
  const timing = leadTiming(lead.priority, lead.requestKind);
  const slotsLeft = Math.max(0, lead.maxContacts - lead.contactedCount);
  const pipeline = lead.pipelineStatus ?? "contacted";

  return (
    <Card style={{ padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {tab === "new" && <Badge tone="coral" size="sm">New</Badge>}
            <Badge tone={timing.emergency ? "coral" : "soft"} size="sm">{timing.label}</Badge>
            {lead.reference && <span style={{ fontSize: 10.5, color: T.mute, fontFamily: T.mono }}>{lead.reference}</span>}
            {lead.posted && <span style={{ fontSize: 11, color: T.mute }}>{leadPosted(lead.posted)}</span>}
            {contacted && (
              <Badge tone={pipelineBadgeTone(pipeline)} size="sm">
                {LEAD_PIPELINE_LABELS[pipeline]}
              </Badge>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{lead.title}</div>
          {lead.desc && (
            <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.desc}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, fontSize: 12, color: T.mute, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="map-pin" size={11} /> {lead.postcode || "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="banknote" size={11} /> {lead.budget != null ? formatGBP(lead.budget) : "Not stated"}
            </span>
            <span style={{ fontFamily: T.mono }}>{lead.contactedCount}/{lead.maxContacts} contacted</span>
          </div>
          {tab === "interested" && <div style={{ marginTop: 8 }}><LeadContactStrip lead={lead} inline /></div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {tab === "new" ? (
            <>
              <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
                Decline
              </Button>
              <Button variant="primary" size="sm" icon="user-check" onClick={onContact} disabled={busy}>
                {busy ? "…" : "Interested"}
              </Button>
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: T.mute }}>{slotsLeft} slot{slotsLeft === 1 ? "" : "s"} left</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function LeadCardCompact({
  lead,
  tab,
  busy,
  pipelineBusy,
  notesSaving,
  onContact,
  onDecline,
  onPipelineChange,
  onNotesSave,
}: {
  lead: PortalLead;
  tab: LeadTab;
  busy: boolean;
  pipelineBusy: boolean;
  notesSaving: boolean;
  onContact: () => void;
  onDecline: () => void;
  onPipelineChange: (s: LeadPipelineStatus) => void;
  onNotesSave: (notes: string) => Promise<void>;
}) {
  const contacted = lead.status === "contacted";
  const timing = leadTiming(lead.priority, lead.requestKind);
  const slotsLeft = Math.max(0, lead.maxContacts - lead.contactedCount);
  const pipeline = lead.pipelineStatus ?? "contacted";

  return (
    <Card hover style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {tab === "new" && <Badge tone="coral" size="sm">New</Badge>}
        <Badge tone={timing.emergency ? "coral" : "soft"} size="sm">{timing.label}</Badge>
        {lead.reference && <span style={{ fontSize: 10.5, color: T.mute, fontFamily: T.mono }}>{lead.reference}</span>}
        {contacted && <Badge tone={pipelineBadgeTone(pipeline)} size="sm">{LEAD_PIPELINE_LABELS[pipeline]}</Badge>}
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{lead.title}</div>
        {lead.desc && (
          <div style={{ fontSize: 12, color: T.slate, marginTop: 4, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {lead.desc}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
        <MetaItem icon="map-pin" label="Location" value={lead.postcode || "—"} />
        <MetaItem icon="banknote" label="Budget" value={lead.budget != null ? formatGBP(lead.budget) : "Not stated"} />
      </div>

      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: lead.maxContacts }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 9999, background: i < lead.contactedCount ? T.coral : T.line }} />
        ))}
      </div>

      {tab === "interested" && (
        <>
          <LeadContactStrip lead={lead} />
          <LeadNotesField value={lead.notes ?? ""} saving={notesSaving} onSave={onNotesSave} compact />
          <PipelineStatusPicker value={pipeline} busy={pipelineBusy} onChange={onPipelineChange} compact />
        </>
      )}

      {tab === "new" ? (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy} style={{ flex: 1 }}>
            Decline
          </Button>
          <Button variant="primary" size="sm" icon="user-check" onClick={onContact} disabled={busy} style={{ flex: 1 }}>
            {busy ? "…" : "Interested"}
          </Button>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: T.mute }}>{slotsLeft} contact slot{slotsLeft === 1 ? "" : "s"} remaining</div>
      )}
    </Card>
  );
}

function MetaItem({ icon, label, value, sub }: { icon: string; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.mute, marginBottom: 4 }}>
        <Icon name={icon} size={11} /> {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ============================================================
// AVAILABLE JOBS
// ============================================================
function acceptJobErrorMessage(json: { code?: string; message?: string; error?: string }): string {
  if (json.code === "accept_not_configured" || json.error === "accept_not_configured") {
    return "Accept is temporarily unavailable — contact Fixfy support or use the Accept link in your email.";
  }
  if (json.code === "os_unauthorized" || json.error === "Unauthorized") {
    return "Could not connect to Fixfy OS — try again later or use the email Accept link.";
  }
  if (json.code === "os_unreachable" || json.error === "os_unreachable") {
    return "Fixfy OS is unreachable — try again or use the email Accept link.";
  }
  if (json.code === "server_misconfigured") {
    return "Portal is misconfigured — contact Fixfy support.";
  }
  return json.message || json.error || "Couldn't accept job";
}

export function AvailableJobsView({
  onShowToast,
  previewMode = false,
  redactSensitive = false,
}: {
  onShowToast: ShowToast;
  previewMode?: boolean;
  redactSensitive?: boolean;
}) {
  const partner = usePartner();
  const myJobs = useMyJobs();
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchAvailableJobs(createClient(), partner.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (job: AvailableJob) => {
    if (previewMode) return;
    setAcceptingId(job.id);
    try {
      const res = await fetch("/api/jobs/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const json = await res.json();
      if (res.ok && json.accepted) {
        onShowToast({ icon: "check-circle-2", text: `Accepted ${job.reference ?? "job"}. Moved to My jobs.` });
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        myJobs.refresh();
      } else if (res.ok) {
        // accepted:false — distinguish "someone else took it" (job_taken) from an
        // offer that was withdrawn/expired/cancelled (gone), which the OS explains
        // in `message`. Showing "another trade took this" for an expired offer is wrong.
        const text =
          json.error === "job_taken"
            ? "Too late — another trade took this one."
            : json.message || "This offer is no longer available.";
        onShowToast({ icon: "lock", text });
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else {
        onShowToast({
          icon: "alert-triangle",
          tone: "coral",
          text: acceptJobErrorMessage(json),
        });
      }
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't accept job" });
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1, overflow: "auto" }}>
      {!previewMode && <PlanUpgradeBanner feature="jobs" />}
      <SectionHeader
        title="Available jobs"
        subtitle="Fixfy-quoted work, customer's already signed off. First to accept wins."
        actions={
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} color={T.mute} /> Loading offers…
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 13, color: T.coral }}>{error}</div>
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
            Retry
          </Button>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon="briefcase" title="No offers right now" hint="When Fixfy broadcasts a job that matches your trades and area, it'll appear here to accept." />
      ) : (
        <>
          <span style={{ fontSize: 12.5, color: T.mute }}>
            <b style={{ color: T.ink, fontWeight: 500 }}>{jobs.length}</b> {jobs.length === 1 ? "offer" : "offers"} · first to accept wins
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {jobs.map((j) => (
              <AvailableJobCard
                key={j.id}
                job={redactSensitive ? redactAvailableJob(j) : j}
                accepting={acceptingId === j.id}
                onAccept={() => accept(j)}
                locked={redactSensitive}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AvailableJobCard({
  job,
  accepting,
  onAccept,
  locked = false,
}: {
  job: AvailableJob;
  accepting: boolean;
  onAccept: () => void;
  locked?: boolean;
}) {
  return (
    <Card
      hover
      style={{
        padding: 0,
        position: "relative",
        overflow: "hidden",
        borderColor: T.line,
        borderWidth: 1,
      }}
    >
      <div
        style={{
          padding: "6px 14px",
          background: T.navy,
          color: T.white,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: 0.2,
        }}
      >
        <Icon name="zap" size={13} />
        <span>First to accept wins</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="fx-mono" style={{ fontSize: 11, color: T.mute }}>
            {job.reference ?? job.id.slice(0, 8)}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 9999, background: T.line }} />
          <Badge tone="soft" size="sm">{job.trade}</Badge>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.ink, lineHeight: 1.4 }}>{job.title}</div>
            <div
              style={{
                fontSize: 13,
                color: T.slate,
                marginTop: 6,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {job.desc}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.navy, lineHeight: 1 }}>
              {locked ? "£•••" : formatGBP(job.total)}
            </div>
            <div style={{ fontSize: 10.5, color: T.coral, marginTop: 4, letterSpacing: 0.3, fontWeight: 600 }}>
              inc VAT
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <MetaItem icon="map-pin" label="Location" value={job.postcode || "—"} sub="Address on accept" />
          <MetaItem icon="clock" label="Duration" value={job.duration} sub={job.timing} />
          <MetaItem icon="user" label="Customer" value="Pre-vetted" sub="Fixfy-quoted" />
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1 }} />
          <Button variant="dark" size="sm" icon="check" onClick={onAccept} disabled={accepting || locked}>
            {locked ? "Add card to accept" : accepting ? "Accepting…" : "Accept job"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// AVAILABLE QUOTES
// ============================================================
export function AvailableQuotesView({
  onShowToast,
  previewMode = false,
  redactSensitive = false,
}: {
  onShowToast: ShowToast;
  previewMode?: boolean;
  redactSensitive?: boolean;
}) {
  const partner = usePartner();
  const [tab, setTab] = useState<QuoteRequestStatus>("to-quote");
  const [drawerQuote, setDrawerQuote] = useState<QuoteRequest | null>(null);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuotes(await fetchAvailableQuotes(createClient(), partner.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const segments: Record<QuoteRequestStatus, QuoteRequest[]> = {
    "to-quote": quotes.filter((q) => q.status === "to-quote"),
    submitted: quotes.filter((q) => q.status === "submitted"),
    won: quotes.filter((q) => q.status === "won"),
    lost: quotes.filter((q) => q.status === "lost"),
  };

  const tabs = [
    { id: "to-quote", label: "To quote", count: segments["to-quote"].length },
    { id: "submitted", label: "Submitted", count: segments.submitted.length },
    { id: "won", label: "Won", count: segments.won.length },
    { id: "lost", label: "Lost", count: segments.lost.length },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1, overflow: "auto" }}>
      {!previewMode && <PlanUpgradeBanner feature="quotes" />}
      <SectionHeader
        title="Available quotes"
        subtitle="Fixfy clients needing a custom estimate. Submit a number, win the work."
      />

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as QuoteRequestStatus)} variant="pills" />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          <div style={{ padding: 8, color: T.mute, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="loader" size={14} color={T.mute} /> Loading quotes…
          </div>
        ) : error ? (
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 13, color: T.coral }}>{error}</div>
            <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
              Retry
            </Button>
          </div>
        ) : segments[tab].length === 0 ? (
          <EmptyState
            icon="file-text"
            title={tab === "lost" ? "Nothing lost recently" : "Nothing here yet"}
            hint={
              tab === "lost"
                ? "When a customer picks someone else, those quotes land here."
                : "Quote requests you're invited to bid on will appear here."
            }
          />
        ) : (
          segments[tab].map((q) => (
            <QuoteRow
              key={q.id}
              q={redactSensitive ? redactQuote(q) : q}
              status={tab}
              locked={redactSensitive}
              onOpen={() => !previewMode && setDrawerQuote(q)}
            />
          ))
        )}
      </div>

      {drawerQuote && (
        <QuoteDrawer
          quote={drawerQuote}
          listStatus={drawerQuote.status}
          partnerId={partner.id}
          partnerName={partner.tradingName || `${partner.firstName} ${partner.lastName}`.trim()}
          onClose={() => setDrawerQuote(null)}
          onShowToast={onShowToast}
          onChanged={() => {
            setDrawerQuote(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function QuoteRow({
  q,
  status,
  onOpen,
  locked = false,
}: {
  q: QuoteRequest;
  status: QuoteRequestStatus;
  onOpen: () => void;
  locked?: boolean;
}) {
  const serviceType = q.serviceType || q.trades[0] || q.title;
  const address = q.propertyAddress || q.postcode || "—";

  return (
    <Card hover style={{ padding: "12px 14px", cursor: "pointer" }} onClick={onOpen}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span className="fx-mono" style={{ fontSize: 10.5, color: T.mute }}>{q.reference ?? q.id.slice(0, 8)}</span>
            {status === "to-quote" && <Badge tone="coral" size="sm">New</Badge>}
            {status === "submitted" && <Badge tone="warning" size="sm">Submitted</Badge>}
            {status === "won" && <Badge tone="success" size="sm">Won</Badge>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>{q.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 8, fontSize: 12, color: T.slate }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="wrench" size={11} color={T.mute} />
              <span style={{ color: T.mute }}>Type</span> {serviceType}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <Icon name="map-pin" size={11} color={T.mute} />
              <span style={{ color: T.mute }}>Address</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{address}</span>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {status === "submitted" && q.yourBid != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.mute, marginBottom: 2 }}>YOUR BID</div>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 600, color: T.navy }}>{formatGBP(q.yourBid)}</div>
            </div>
          )}
          {status === "won" && q.awardedAmount != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 600, color: T.green }}>{formatGBP(q.awardedAmount)}</div>
            </div>
          )}
          {status === "to-quote" && (
            <div onClick={(e) => e.stopPropagation()}>
              <Button variant="primary" size="sm" icon="send" onClick={onOpen} disabled={locked}>
                {locked ? "Add card" : "Submit quote"}
              </Button>
            </div>
          )}
          {status === "submitted" && (
            <div onClick={(e) => e.stopPropagation()}>
              <Button variant="secondary" size="sm" icon="pencil" onClick={onOpen}>Update</Button>
            </div>
          )}
          <Icon name="chevron-right" size={16} color={T.mute} />
        </div>
      </div>
    </Card>
  );
}
