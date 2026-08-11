"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { T } from "@/lib/tokens";
import { Badge, Button, Field, Icon, IconButton, Input } from "@/components/ui/primitives";
import { QuoteAddressMap } from "@/components/ui/quote-address-map";
import { formatGBP, formatGBPdec } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { submitBid } from "@/lib/queries/quotes";
import {
  bidFormValuesFromNotes,
  buildBidProposalFromForm,
  validateBidSubmitForm,
  type BidSubmitFormValues,
} from "@/lib/quote-bid-payload";
import type { QuoteRequest, QuoteRequestStatus } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

export type QuoteDrawerDetail = {
  id: string;
  reference?: string;
  title: string;
  scope: string;
  propertyAddress: string;
  postcode: string;
  clientName: string;
  serviceType: string;
  images: string[];
  quoteStatus: string;
  deadline: string;
  bidDeadlineAt?: string | null;
  bidWindowHours?: number;
  myBid?: { amount?: number; status?: string; notes?: string | null } | null;
};

export function QuoteDrawer({
  quote,
  listStatus,
  partnerId,
  partnerName,
  onClose,
  onShowToast,
  onChanged,
}: {
  quote: QuoteRequest;
  listStatus: QuoteRequestStatus;
  partnerId: string;
  partnerName: string;
  onClose: () => void;
  onShowToast: ShowToast;
  onChanged: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [detail, setDetail] = useState<QuoteDrawerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(quote.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load quote");
      setDetail(json as QuoteDrawerDetail);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load quote");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [quote.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

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

  const decline = async () => {
    setDeclining(true);
    try {
      const res = await fetch("/api/quotes/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not decline");
      onShowToast({ icon: "x", text: "Quote declined — moved to Lost." });
      onChanged();
      handleClose();
    } catch (e) {
      onShowToast({
        icon: "alert-triangle",
        tone: "coral",
        text: e instanceof Error ? e.message : "Could not decline",
      });
    } finally {
      setDeclining(false);
    }
  };

  const canBid = listStatus === "to-quote" || listStatus === "submitted";
  const showDecline = listStatus === "to-quote";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        animation: closing ? "fx-fade-in 200ms reverse" : "fx-fade-in 200ms",
      }}
    >
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(2,0,64,0.48)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        className="quote-drawer-panel"
        style={{
          animation: closing
            ? "fx-slide-right 200ms cubic-bezier(0.2,0,0,1) reverse"
            : "fx-slide-right 220ms cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div
          className="quote-drawer-header"
          style={{
            borderBottom: `1px solid ${T.line}`,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <IconButton icon="x" size={32} tone="ghost" onClick={handleClose} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="fx-mono" style={{ fontSize: 11, color: T.mute }}>
                {detail?.reference ?? quote.reference ?? quote.id.slice(0, 8)}
              </span>
              {(detail?.serviceType || quote.serviceType) && (
                <Badge tone="soft" size="sm">{detail?.serviceType || quote.serviceType}</Badge>
              )}
              {listStatus === "submitted" && <Badge tone="warning" size="sm">Bid submitted</Badge>}
              {listStatus === "won" && <Badge tone="success" size="sm">Won</Badge>}
            </div>
            <div
              className="quote-drawer-title"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: T.navy,
                marginTop: 4,
                lineHeight: 1.25,
              }}
            >
              {detail?.title ?? quote.title}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "0 0 8px" }}>
          {loading ? (
            <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 8, color: T.mute, fontSize: 13 }}>
              <Icon name="loader" size={14} /> Loading quote…
            </div>
          ) : loadError ? (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <p style={{ fontSize: 13, color: T.coral }}>{loadError}</p>
              <Button variant="secondary" size="sm" icon="refresh-cw" onClick={loadDetail}>
                Retry
              </Button>
            </div>
          ) : detail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div className="quote-drawer-map-wrap" style={{ padding: "0 0 10px" }}>
                <QuoteAddressMap
                  className="quote-drawer-map"
                  address={detail.propertyAddress}
                  postcode={detail.postcode || quote.postcode}
                  minHeight={120}
                  maxHeight={132}
                  compact
                  addressOverlay={detail.propertyAddress || detail.postcode || quote.postcode}
                />
              </div>

              <div className="quote-drawer-body-pad" style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <InfoCard
                    icon="wrench"
                    label="Type of work"
                    value={detail.serviceType || detail.title}
                    compact
                  />
                  {listStatus === "to-quote" && detail.bidWindowHours ? (
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "#FFF7ED",
                        border: "1px solid #F3D9A4",
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: T.ink,
                        flex: "1 1 160px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9A6B00", textTransform: "uppercase", marginBottom: 2 }}>
                        {detail.bidWindowHours}h to bid
                      </div>
                      {detail.deadline !== "—" ? (
                        <span style={{ color: T.slate }}>Until {detail.deadline}</span>
                      ) : (
                        "Submit before the window closes"
                      )}
                    </div>
                  ) : null}
                </div>

                {detail.scope ? (
                  <section>
                    <SectionLabel>Scope of work</SectionLabel>
                    <div
                      className="quote-drawer-scope"
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: T.paper,
                        border: `1px solid ${T.line}`,
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        color: T.ink,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {detail.scope}
                    </div>
                  </section>
                ) : null}

                {detail.images.length > 0 ? (
                  <section>
                    <SectionLabel>Site photos</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                      {detail.images.map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "block", borderRadius: 10, overflow: "hidden", border: `1px solid ${T.line}` }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Site photo ${i + 1}`} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}

                {canBid ? (
                  <section>
                    <SectionLabel>{listStatus === "submitted" ? "Update your proposal" : "Your proposal"}</SectionLabel>
                    <QuoteBidFormBody
                      quote={quote}
                      detail={detail}
                      listStatus={listStatus}
                      partnerId={partnerId}
                      partnerName={partnerName}
                      onShowToast={onShowToast}
                      onSubmitted={() => {
                        onChanged();
                        handleClose();
                      }}
                      embedded
                    />
                  </section>
                ) : listStatus === "won" && detail.myBid?.amount != null ? (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: T.green50,
                      border: `1px solid ${T.green}`,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 11, color: T.green, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>AWARDED</div>
                    <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 600, color: T.navy }}>{formatGBP(detail.myBid.amount)}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {!loading && !loadError && detail && (
          <div
            className="quote-drawer-footer"
            style={{
              padding: 16,
              borderTop: `1px solid ${T.line}`,
              background: T.paper,
              display: "flex",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {showDecline ? (
              <div className="quote-drawer-decline">
                <Button variant="secondary" full onClick={decline} disabled={declining}>
                  {declining ? "Declining…" : "Decline"}
                </Button>
              </div>
            ) : null}
            <div style={{ flex: 1 }} />
            {!canBid && (
              <Button variant="secondary" onClick={handleClose}>
                Close
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.mute, textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </p>
  );
}

function InfoCard({
  icon,
  label,
  value,
  compact,
}: {
  icon: string;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        padding: compact ? "8px 10px" : 12,
        borderRadius: 10,
        border: `1px solid ${T.line}`,
        background: T.paper,
        flex: compact ? "1 1 140px" : undefined,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
        <Icon name={icon} size={11} /> {label}
      </div>
      <div style={{ fontSize: compact ? 13 : 13.5, fontWeight: 500, color: T.ink, lineHeight: 1.35 }}>{value || "—"}</div>
    </div>
  );
}

function QuoteBidFormBody({
  quote,
  detail,
  listStatus,
  partnerId,
  partnerName,
  onShowToast,
  onSubmitted,
  embedded,
}: {
  quote: QuoteRequest;
  detail: QuoteDrawerDetail;
  listStatus: QuoteRequestStatus;
  partnerId: string;
  partnerName: string;
  onShowToast: ShowToast;
  onSubmitted: () => void;
  embedded?: boolean;
}) {
  const isUpdate = listStatus === "submitted";
  const initial = bidFormValuesFromNotes(detail.myBid?.notes ?? quote.myBidNotes);
  const [labour, setLabour] = useState(initial.labourCost ?? "");
  const [materials, setMaterials] = useState(initial.materialsCost ?? "");
  const [labourNotes, setLabourNotes] = useState(initial.labourDescription ?? "");
  const [materialsNotes, setMaterialsNotes] = useState(initial.materialsDescription ?? "");
  const [scope, setScope] = useState(initial.scope ?? detail.scope ?? "");
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
    background: T.white,
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
      onShowToast({ icon: "alert-triangle", tone: "coral", text: err });
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
      onShowToast({
        icon: "send",
        text: isUpdate
          ? "Bid updated. We'll notify you when the customer decides."
          : "Quote submitted. We'll notify you when the customer decides.",
      });
      onSubmitted();
    } catch (e) {
      onShowToast({
        icon: "alert-triangle",
        tone: "coral",
        text: e instanceof Error ? e.message : "Couldn't submit quote",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: embedded ? 16 : 0,
        borderRadius: embedded ? 12 : 0,
        border: embedded ? `1px solid ${T.line}` : undefined,
        background: embedded ? T.white : undefined,
      }}
    >
      <p style={{ fontSize: 12, color: T.mute, lineHeight: 1.45, margin: 0 }}>
        All prices are <strong>inc VAT</strong>. Labour and materials notes, scope, and two available start dates are sent to Fixfy OS for the customer proposal.
      </p>

      <div className="quote-drawer-form-grid">
        <Field label="Labour (£ inc VAT) *">
          <Input value={labour} onChange={setLabour} prefix="£" />
        </Field>
        <Field label="Materials (£ inc VAT) *">
          <Input value={materials} onChange={setMaterials} prefix="£" />
        </Field>
      </div>

      <Field label="Labour notes *">
        <textarea
          value={labourNotes}
          onChange={(e) => setLabourNotes(e.target.value)}
          placeholder="Hours on site, trades, prep, clean-down…"
          style={textareaStyle}
        />
      </Field>

      <Field label="Materials notes *">
        <textarea
          value={materialsNotes}
          onChange={(e) => setMaterialsNotes(e.target.value)}
          placeholder="Materials included, allowances, or customer supplies…"
          style={textareaStyle}
        />
      </Field>

      <div
        style={{
          padding: 14,
          background: T.paper2,
          borderRadius: 10,
          border: `1px solid ${T.line}`,
        }}
      >
        <div style={{ fontSize: 11, color: T.mute, letterSpacing: 0.4 }}>TOTAL INC VAT</div>
        <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 600, color: T.navy }}>{formatGBPdec(total)}</div>
      </div>

      <Field label="Scope for customer proposal *">
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Work you'll carry out, assumptions, exclusions…"
          style={{ ...textareaStyle, minHeight: 90 }}
        />
      </Field>

      <div className="quote-drawer-form-grid">
        <Field label="Available start date 1 *">
          <input type="date" value={startDate1} onChange={(e) => setStartDate1(e.target.value)} style={dateInputStyle} />
        </Field>
        <Field label="Available start date 2 *">
          <input type="date" value={startDate2} onChange={(e) => setStartDate2(e.target.value)} style={dateInputStyle} />
        </Field>
      </div>

      <Field label="Additional note (optional)">
        <textarea
          value={coverNote}
          onChange={(e) => setCoverNote(e.target.value)}
          placeholder="Access notes, site visit recommended, parking…"
          style={textareaStyle}
        />
      </Field>

      <Button variant="primary" icon="send" onClick={send} disabled={submitting || total <= 0} style={{ width: "100%" }}>
        {submitting ? "Sending…" : isUpdate ? "Update bid" : "Submit quote"}
      </Button>
    </div>
  );
}

const dateInputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${T.line}`,
  fontFamily: T.sans,
  fontSize: 13,
  color: T.ink,
  boxSizing: "border-box",
};
