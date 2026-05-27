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
import { fetchAvailableJobs } from "@/lib/queries/available-jobs";
import { fetchLeads, setLeadStatus, type RealLead } from "@/lib/queries/leads";
import type { AvailableJob, QuoteRequest, QuoteRequestStatus } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

// ============================================================
// LEADS
// ============================================================
export function LeadsView({ onShowToast }: { onShowToast: ShowToast }) {
  const partner = usePartner();
  const [leads, setLeads] = useState<RealLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await fetchLeads(createClient(), partner.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (lead: RealLead, status: "contacted" | "declined") => {
    setBusyId(lead.offerId);
    try {
      await setLeadStatus(createClient(), lead.offerId, status);
      if (status === "declined") {
        setLeads((prev) => prev.filter((l) => l.offerId !== lead.offerId));
        onShowToast({ icon: "x", text: "Lead declined." });
      } else {
        setLeads((prev) => prev.map((l) => (l.offerId === lead.offerId ? { ...l, status: "contacted" } : l)));
        onShowToast({ icon: "phone", text: "Marked as contacted. We've let the office know." });
      }
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

function LeadCard({ lead, busy, onContact, onDecline }: { lead: RealLead; busy: boolean; onContact: () => void; onDecline: () => void }) {
  const contacted = lead.status === "contacted";
  return (
    <Card hover style={{ padding: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ padding: 16, paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Badge tone={lead.emergency ? "coral" : "soft"} size="sm">{lead.timing}</Badge>
          <span style={{ fontSize: 11.5, color: T.mute }}>Sent {lead.posted}</span>
          {contacted && (
            <Badge tone="success" size="sm" icon="check">Contacted</Badge>
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
      </div>

      {/* Action row */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${T.line}` }}>
        {contacted ? (
          <div style={{ flex: 1, fontSize: 12, color: T.slate, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="phone" size={12} color={T.green} /> You marked this contacted.
          </div>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
              Decline
            </Button>
            <span style={{ flex: 1 }} />
            <Button variant="primary" size="sm" icon="phone" onClick={onContact} disabled={busy}>
              {busy ? "…" : "Mark contacted"}
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
          {status === "submitted" && q.yourBid != null && q.leadingBid != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.mute, marginBottom: 2 }}>YOUR BID</div>
              <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.navy }}>{formatGBP(q.yourBid)}</div>
              <div style={{ fontSize: 11, color: q.yourBid > q.leadingBid ? T.amber : T.green, marginTop: 2 }}>
                {q.yourBid > q.leadingBid
                  ? `Leading bid £${q.leadingBid} — £${q.yourBid - q.leadingBid} ahead of you`
                  : "You're leading"}
              </div>
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
                <Button variant="dark" size="sm" icon="pencil">Update bid</Button>
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
  const [labour, setLabour] = useState("");
  const [materials, setMaterials] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const total = (parseFloat(labour) || 0) + (parseFloat(materials) || 0);

  const send = async () => {
    if (total <= 0) {
      onError("Enter a labour or materials amount before sending.");
      return;
    }
    setSubmitting(true);
    try {
      await submitBid(createClient(), { quoteId: quote.id, partnerId, partnerName, amount: total, notes });
      onSubmitted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't submit quote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Submit quote — ${quote.reference ?? quote.id.slice(0, 8)}`} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
          <b style={{ color: T.ink, fontWeight: 500 }}>{quote.title}</b>
          <br />
          {quote.desc}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Labour (£ inc VAT)">
            <Input value={labour} onChange={setLabour} prefix="£" />
          </Field>
          <Field label="Materials (£ inc VAT)">
            <Input value={materials} onChange={setMaterials} prefix="£" />
          </Field>
        </div>

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Estimated duration">
            <Input value="1.5 days" suffix="hrs/days" />
          </Field>
          <Field label="Earliest start">
            <Input value="Tue 26 May" icon="calendar" />
          </Field>
        </div>

        <Field label="Cover note (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the customer should know — site visit recommended, materials assumptions, exclusions…"
            style={{
              width: "100%",
              minHeight: 70,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              fontFamily: T.sans,
              fontSize: 13,
              color: T.ink,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </Field>

        <Field label="Attach PDF quote (optional)">
          <div
            style={{
              padding: 14,
              border: `1.5px dashed ${T.line}`,
              borderRadius: 8,
              textAlign: "center",
              color: T.mute,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <Icon name="upload" size={16} color={T.mute} />
            <span style={{ marginLeft: 8 }}>
              Drag a PDF, or <span style={{ color: T.coral, fontWeight: 500 }}>browse</span>
            </span>
          </div>
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
        <div style={{ flex: 1, fontSize: 12, color: T.mute }}>Editable until the customer decides.</div>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" icon="send" onClick={send} disabled={submitting || total <= 0}>
          {submitting ? "Sending…" : "Send quote"}
        </Button>
      </div>
    </Modal>
  );
}
