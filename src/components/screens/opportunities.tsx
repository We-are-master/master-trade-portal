"use client";

// Opportunities — Leads, Available jobs, Available quotes. Ported from opportunities.jsx.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  SectionHeader,
  Tabs,
} from "@/components/ui/primitives";
import { formatGBP, formatGBPdec } from "@/lib/format";
import { usePartner } from "@/components/partner-context";
import { useMyJobs } from "@/components/jobs-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAvailableQuotes, submitBid } from "@/lib/queries/quotes";
import {
  bidFormValuesFromNotes,
  buildBidProposalFromForm,
  validateBidSubmitForm,
  type BidSubmitFormValues,
} from "@/lib/quote-bid-payload";
import { fetchAvailableJobs } from "@/lib/queries/available-jobs";
interface PortalLead {
  offerId: string; // lead id (public.leads)
  reference?: string | null;
  status: string;
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
}
import type { AvailableJob, QuoteRequest, QuoteRequestStatus } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

// ============================================================
// LEADS
// ============================================================
export function LeadsView({ onShowToast }: { onShowToast: ShowToast }) {
  const partner = usePartner();
  const [leads, setLeads] = useState<PortalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const act = async (lead: PortalLead, status: "contacted" | "declined") => {
    // Decline isn't stored (no column on lead_partner_offers) — just hide it locally.
    if (status === "declined") {
      setLeads((prev) => prev.filter((l) => l.offerId !== lead.offerId));
      onShowToast({ icon: "x", text: "Lead declined." });
      return;
    }
    setBusyId(lead.offerId);
    try {
      const res = await fetch("/api/leads/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.offerId, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't update lead");
      const contact = json.contact ?? {};
      setLeads((prev) =>
        prev.map((l) =>
          l.offerId === lead.offerId
            ? { ...l, status: "contacted", contactedCount: l.contactedCount + 1, email: contact.email, phone: contact.phone, address: contact.address }
            : l,
        ),
      );
      onShowToast({ icon: "phone", text: "Customer details unlocked — reach out now." });
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't update lead" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1, overflow: "auto" }}>
      <SectionHeader
        title="Leads"
        subtitle="Customer enquiries Fixfy has sent your way. Reach out fast — first contact wins the work."
        actions={
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={load}>
            Refresh
          </Button>
        }
      />

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
      ) : leads.length === 0 ? (
        <EmptyState icon="sparkles" title="No leads right now" hint="When Fixfy sends a customer enquiry your way, it'll appear here to act on." />
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: T.mute }}>
            <b style={{ color: T.ink, fontWeight: 500 }}>{leads.length}</b> {leads.length === 1 ? "lead" : "leads"} ·{" "}
            <b style={{ color: T.coral, fontWeight: 500 }}>{leads.filter((l) => l.status !== "contacted").length}</b> awaiting your contact
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {leads.map((l) => (
              <LeadCard key={l.offerId} lead={l} busy={busyId === l.offerId} onContact={() => act(l, "contacted")} onDecline={() => act(l, "declined")} />
            ))}
          </div>
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

function LeadCard({ lead, busy, onContact, onDecline }: { lead: PortalLead; busy: boolean; onContact: () => void; onDecline: () => void }) {
  const contacted = lead.status === "contacted";
  const timing = leadTiming(lead.priority, lead.requestKind);
  const slotsLeft = Math.max(0, lead.maxContacts - lead.contactedCount);
  return (
    <Card hover style={{ padding: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ padding: 16, paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Badge tone={timing.emergency ? "coral" : "soft"} size="sm">{timing.label}</Badge>
          {lead.reference && <span style={{ fontSize: 11, color: T.mute, fontFamily: T.mono }}>{lead.reference}</span>}
          {lead.posted && <span style={{ fontSize: 11.5, color: T.mute }}>Sent {leadPosted(lead.posted)}</span>}
          {contacted && (
            <Badge tone="success" size="sm" icon="check">You contacted</Badge>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 500, color: T.ink, lineHeight: 1.4 }}>{lead.title}</div>
        {lead.desc && (
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
            {lead.desc}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <MetaItem icon="map-pin" label="Location" value={lead.postcode || "—"} />
          <MetaItem icon="banknote" label="Budget" value={lead.budget != null ? formatGBP(lead.budget) : "Not stated"} />
        </div>

        {contacted && (lead.phone || lead.email || lead.address) && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              background: T.paper,
              border: `1px solid ${T.line}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11, color: T.mute, display: "flex", alignItems: "center", gap: 5 }}>
              <Icon name="user" size={11} /> Customer contact
            </div>
            {lead.phone && (
              <a href={`tel:${lead.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: T.ink, textDecoration: "none" }}>
                <Icon name="phone" size={13} color={T.green} /> {lead.phone}
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: T.ink, textDecoration: "none", wordBreak: "break-all" }}>
                <Icon name="mail" size={13} color={T.coral} /> {lead.email}
              </a>
            )}
            {lead.address && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.slate }}>
                <Icon name="map-pin" size={13} color={T.mute} /> {lead.address}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Competition strip — closes once maxContacts trades reach out */}
      <div style={{ padding: "10px 16px", background: T.paper, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 3, flex: 1 }}>
          {Array.from({ length: lead.maxContacts }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 9999, background: i < lead.contactedCount ? T.coral : T.line }} />
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: T.mute, fontFamily: T.mono, whiteSpace: "nowrap" }}>
          {lead.contactedCount}/{lead.maxContacts} contacted
        </div>
      </div>

      {/* Action row */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${T.line}` }}>
        {contacted ? (
          <div style={{ flex: 1, fontSize: 12, color: T.slate, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="phone" size={12} color={T.green} /> You reached out. {slotsLeft} slot{slotsLeft === 1 ? "" : "s"} left.
          </div>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: 12, color: T.mute }}>{slotsLeft} of {lead.maxContacts} contact slots left · first-come.</div>
            <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
              Decline
            </Button>
            <Button variant="primary" size="sm" icon="phone" onClick={onContact} disabled={busy}>
              {busy ? "…" : "Contact customer"}
            </Button>
          </>
        )}
      </div>
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
export function AvailableJobsView({ onShowToast }: { onShowToast: ShowToast }) {
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
        onShowToast({ icon: "lock", text: "Too late — another trade took this one." });
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else {
        onShowToast({ icon: "alert-triangle", tone: "coral", text: json.error || "Couldn't accept job" });
      }
    } catch (e) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: e instanceof Error ? e.message : "Couldn't accept job" });
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, flex: 1, overflow: "auto" }}>
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
              <AvailableJobCard key={j.id} job={j} accepting={acceptingId === j.id} onAccept={() => accept(j)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AvailableJobCard({ job, accepting, onAccept }: { job: AvailableJob; accepting: boolean; onAccept: () => void }) {
  const expiring = job.expiresMin != null;
  const [timer, setTimer] = useState((job.expiresMin ?? 0) * 60);
  useEffect(() => {
    if (!expiring) return;
    const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [expiring]);
  const mm = String(Math.floor(timer / 60)).padStart(2, "0");
  const ss = String(timer % 60).padStart(2, "0");

  return (
    <Card
      hover
      style={{
        padding: 0,
        position: "relative",
        overflow: "hidden",
        borderColor: expiring ? T.coral : T.line,
        borderWidth: expiring ? 1.5 : 1,
      }}
    >
      {expiring && (
        <div
          style={{
            padding: "6px 14px",
            background: T.coral,
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
          <span>
            OFFER · expires in{" "}
            <span className="fx-mono" style={{ fontWeight: 600 }}>
              {mm}:{ss}
            </span>
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: T.white,
              animation: "fx-pulse 1s ease-in-out infinite",
            }}
          />
        </div>
      )}
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
              {formatGBP(job.total)}
            </div>
            <div style={{ fontSize: 10.5, color: T.mute, marginTop: 4, letterSpacing: 0.3 }}>INC VAT</div>
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
          <Button variant="dark" size="sm" icon="check" onClick={onAccept} disabled={accepting}>
            {accepting ? "Accepting…" : "Accept job"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// AVAILABLE QUOTES
// ============================================================
export function AvailableQuotesView({ onShowToast }: { onShowToast: ShowToast }) {
  const partner = usePartner();
  const [tab, setTab] = useState<QuoteRequestStatus>("to-quote");
  const [submitFor, setSubmitFor] = useState<QuoteRequest | null>(null);
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
          segments[tab].map((q) => <QuoteRow key={q.id} q={q} status={tab} onSubmit={() => setSubmitFor(q)} />)
        )}
      </div>

      {submitFor && (
        <SubmitQuoteModal
          quote={submitFor}
          partnerName={partner.tradingName || `${partner.firstName} ${partner.lastName}`.trim()}
          partnerId={partner.id}
          onClose={() => setSubmitFor(null)}
          onSubmitted={() => {
            setSubmitFor(null);
            onShowToast({ icon: "send", text: "Quote submitted. We'll notify you the moment the customer decides." });
            void load();
          }}
          onError={(msg) => onShowToast({ icon: "alert-triangle", tone: "coral", text: msg })}
        />
      )}
    </div>
  );
}

function QuoteRow({ q, status, onSubmit }: { q: QuoteRequest; status: QuoteRequestStatus; onSubmit: () => void }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="fx-mono" style={{ fontSize: 11, color: T.mute }}>
              {q.reference ?? q.id.slice(0, 8)}
            </span>
            {q.trades.map((t) => (
              <Badge key={t} tone="soft" size="sm">{t}</Badge>
            ))}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: T.ink }}>{q.title}</div>
          <div style={{ fontSize: 13, color: T.slate, marginTop: 6, lineHeight: 1.5 }}>{q.desc}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, fontSize: 12, color: T.mute }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="map-pin" size={12} /> {q.postcode} · <span className="fx-mono">{q.distance} mi</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="calendar" size={12} /> Deadline {q.deadline}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 200 }}>
          {status === "submitted" && q.yourBid != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.mute, marginBottom: 2 }}>YOUR BID</div>
              <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.navy }}>{formatGBP(q.yourBid)}</div>
              <div style={{ fontSize: 11, color: T.mute, marginTop: 2 }}>Submitted — awaiting decision</div>
            </div>
          )}
          {status === "won" && q.awardedAmount != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.green, marginBottom: 2, fontWeight: 600, letterSpacing: 0.4 }}>WON</div>
              <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.navy }}>
                {formatGBP(q.awardedAmount)}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {status === "to-quote" && (
              <>
                <Button variant="secondary" size="sm" icon="calendar">Book visit</Button>
                <Button variant="primary" size="sm" icon="send" onClick={onSubmit}>Submit quote</Button>
              </>
            )}
            {status === "submitted" && (
              <>
                <Button variant="secondary" size="sm">Withdraw</Button>
                <Button variant="dark" size="sm" icon="pencil" onClick={onSubmit}>Update bid</Button>
              </>
            )}
            {status === "won" && <Button variant="primary" size="sm" icon="arrow-right">Open job</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SubmitQuoteModal({
  quote,
  partnerName,
  partnerId,
  onClose,
  onSubmitted,
  onError,
}: {
  quote: QuoteRequest;
  partnerName: string;
  partnerId: string;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const isUpdate = quote.status === "submitted";
  const initial = bidFormValuesFromNotes(quote.myBidNotes);
  const [labour, setLabour] = useState(initial.labourCost ?? "");
  const [materials, setMaterials] = useState(initial.materialsCost ?? "");
  const [labourNotes, setLabourNotes] = useState(initial.labourDescription ?? "");
  const [materialsNotes, setMaterialsNotes] = useState(initial.materialsDescription ?? "");
  const [scope, setScope] = useState(initial.scope ?? "");
  const [startDate1, setStartDate1] = useState(initial.startDate1 ?? "");
  const [startDate2, setStartDate2] = useState(initial.startDate2 ?? "");
  const [coverNote, setCoverNote] = useState(initial.coverNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const total = (parseFloat(labour) || 0) + (parseFloat(materials) || 0);

  const textareaStyle = {
    width: "100%",
    minHeight: 70,
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${T.line}`,
    fontFamily: T.sans,
    fontSize: 13,
    color: T.ink,
    outline: "none",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
  };

  const send = async () => {
    const form: BidSubmitFormValues = {
      labourCost: labour,
      materialsCost: materials,
      labourDescription: labourNotes,
      materialsDescription: materialsNotes,
      scope,
      startDate1,
      startDate2,
      coverNote,
    };
    const err = validateBidSubmitForm(form);
    if (err) {
      onError(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildBidProposalFromForm(form);
      await submitBid(createClient(), {
        quoteId: quote.id,
        partnerId,
        partnerName,
        amount: total,
        payload,
      });
      onSubmitted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't submit quote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`${isUpdate ? "Update bid" : "Submit quote"} — ${quote.reference ?? quote.id.slice(0, 8)}`} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
          <b style={{ color: T.ink, fontWeight: 500 }}>{quote.title}</b>
          {quote.desc ? (
            <>
              <br />
              {quote.desc}
            </>
          ) : null}
        </div>

        <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.45 }}>
          Required fields match Fixfy OS — labour and materials notes, scope, and two start dates so the office can send the customer proposal after approval.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Labour (£ inc VAT) *">
            <Input value={labour} onChange={setLabour} prefix="£" />
          </Field>
          <Field label="Materials (£ inc VAT) *">
            <Input value={materials} onChange={setMaterials} prefix="£" />
          </Field>
        </div>

        <Field label="Labour line notes *">
          <textarea
            value={labourNotes}
            onChange={(e) => setLabourNotes(e.target.value)}
            placeholder="What labour includes — hours, trades on site, prep, clean-down…"
            style={textareaStyle}
          />
        </Field>

        <Field label="Materials line notes *">
          <textarea
            value={materialsNotes}
            onChange={(e) => setMaterialsNotes(e.target.value)}
            placeholder="Materials included, allowances, or state if customer supplies materials…"
            style={textareaStyle}
          />
        </Field>

        <div
          style={{
            padding: 14,
            background: T.paper,
            borderRadius: 10,
            border: `1px solid ${T.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: T.mute, letterSpacing: 0.4 }}>YOUR TOTAL</div>
            <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 500, color: T.navy }}>{formatGBPdec(total)}</div>
          </div>
          <div style={{ fontSize: 12, color: T.mute, textAlign: "right" }}>
            <div>Net-7 from sign-off</div>
            <div className="fx-mono">~{formatGBP(total * 0.83)} after VAT</div>
          </div>
        </div>

        <Field label="Scope of work (for customer email / PDF) *">
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Describe the work you will carry out, assumptions, and exclusions…"
            style={{ ...textareaStyle, minHeight: 90 }}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Start date option 1 *">
            <input
              type="date"
              value={startDate1}
              onChange={(e) => setStartDate1(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                fontFamily: T.sans,
                fontSize: 13,
                color: T.ink,
                boxSizing: "border-box",
              }}
            />
          </Field>
          <Field label="Start date option 2 *">
            <input
              type="date"
              value={startDate2}
              onChange={(e) => setStartDate2(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                fontFamily: T.sans,
                fontSize: 13,
                color: T.ink,
                boxSizing: "border-box",
              }}
            />
          </Field>
        </div>

        <Field label="Additional note (optional)">
          <textarea
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
            placeholder="Anything else the customer should know — site visit recommended, access notes…"
            style={textareaStyle}
          />
        </Field>
      </div>

      <div
        style={{
          padding: 16,
          borderTop: `1px solid ${T.line}`,
          background: T.paper,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, fontSize: 12, color: T.mute }}>
          {isUpdate ? "Updates your pending bid until the customer decides." : "Editable until the customer decides."}
        </div>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" icon="send" onClick={send} disabled={submitting || total <= 0}>
          {submitting ? "Sending…" : isUpdate ? "Update bid" : "Send quote"}
        </Button>
      </div>
    </Modal>
  );
}
