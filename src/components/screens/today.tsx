"use client";

// Today — a tela de entrada do parceiro (redesign 15/10/2026). Mostra só o que
// pede ação hoje: o que está pendente (report, reclamação, documento), o
// próximo job, o que vem depois, o próximo pagamento e as ofertas novas.

import { useEffect, useMemo, useState } from "react";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";
import { UButton, UCard, UCardHead, UChip, ULinkButton, UNO, UTile, UViewHead, TONES, type Tone } from "@/components/ui/uno";
import { formatGBPdec } from "@/lib/format";
import { londonYmd } from "@/lib/date-range-filter";
import { formatPayRunDate, formatPeriodRange } from "@/lib/pay-period";
import { redactMyJob } from "@/lib/preview-redact";
import { usePartner } from "@/components/partner-context";
import { useMyJobs } from "@/components/jobs-context";
import { useOffers } from "@/components/offers-context";
import { useIsMobile } from "@/hooks/use-media-query";
import { createClient } from "@/lib/supabase/client";
import { fetchPartnerDocuments, type PartnerDoc } from "@/lib/queries/partner-documents";
import { fetchPayPeriodSummary, type PayPeriodSummary } from "@/lib/queries/pay-periods";
import type { MyJob } from "@/types";

const ATIVO = new Set(["scheduled", "in_progress"]);

function londonHM(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
}

function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function startsIn(iso?: string): string | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return null;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

function dayTag(ymd: string | undefined, today: string): { label: string; today: boolean } {
  if (!ymd) return { label: "TBC", today: false };
  if (ymd === today) return { label: "Today", today: true };
  const d = new Date(`${ymd}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return { label: "Tomorrow", today: false };
  if (diff > 1 && diff < 7) return { label: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), today: false };
  return { label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), today: false };
}

function area(job: MyJob): string {
  return job.postcode ? job.postcode.split(" ")[0] : "";
}

function mapsUrl(job: MyJob): string | null {
  const q = job.customer.address || job.postcode;
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}

interface Pendencia {
  id: string;
  tone: Tone;
  icon: string;
  title: string;
  text: string;
  cta: string;
  run: () => void;
}

export function TodayView({
  onOpenJob,
  onOpenReport,
  onNav,
  previewMode = false,
  redactSensitive = false,
}: {
  onOpenJob: (id: string) => void;
  onOpenReport: (id: string) => void;
  onNav: (route: string) => void;
  previewMode?: boolean;
  redactSensitive?: boolean;
}) {
  const partner = usePartner();
  const isMobile = useIsMobile();
  const { jobs: rawJobs, loading } = useMyJobs();
  const offers = useOffers();
  const [docs, setDocs] = useState<PartnerDoc[] | null>(null);
  const [pay, setPay] = useState<PayPeriodSummary | null>(null);
  const today = londonYmd();

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();
    void fetchPartnerDocuments(sb, partner.id)
      .then((r) => !cancelled && setDocs(r))
      .catch(() => undefined);
    void fetchPayPeriodSummary(sb, partner.id)
      .then((r) => !cancelled && setPay(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const jobs = useMemo(() => (redactSensitive ? rawJobs.map(redactMyJob) : rawJobs), [rawJobs, redactSensitive]);

  const v = useMemo(() => {
    const ativos = jobs.filter((j) => ATIVO.has(j.status));
    const proximos = ativos.filter((j) => (j.scheduledDate ?? "9999") >= today);
    const next = proximos.find((j) => !j.needsAttention) ?? proximos[0] ?? null;
    const seguintes = proximos.filter((j) => j !== next).slice(0, 5);
    // Report pendente: começou (ou o dia já passou) e ainda não foi enviado.
    const reports = ativos.filter(
      (j) => !j.signed && !j.needsAttention && (j.status === "in_progress" || (j.scheduledDate ?? "9999") < today),
    );
    const reclamacoes = jobs.filter((j) => j.needsAttention && !j.onHoldSubmissionAt);
    const hoje = ativos.filter((j) => j.scheduledDate === today).length;
    return { next, seguintes, reports, reclamacoes, hoje };
  }, [jobs, today]);

  const docAviso = useMemo(() => (docs ?? []).find((d) => d.warning), [docs]);

  const pendencias: Pendencia[] = [];
  for (const j of v.reclamacoes.slice(0, 2)) {
    pendencias.push({
      id: `c-${j.uuid}`,
      tone: "bad",
      icon: "message-square-warning",
      title: j.onHoldLabel ? `${j.onHoldLabel} to answer` : "Complaint to answer",
      text: `${j.title}${area(j) ? ` · ${area(j)}` : ""}. Reply so the job can move on.`,
      cta: "Answer",
      run: () => onOpenJob(j.id),
    });
  }
  if (v.reports.length > 0) {
    const j = v.reports[0];
    pendencias.push({
      id: "reports",
      tone: "warn",
      icon: "camera",
      title: v.reports.length === 1 ? "1 report to send" : `${v.reports.length} reports to send`,
      text: `${j.title}${area(j) ? ` · ${area(j)}` : ""}. Payment goes out once the report is in.`,
      cta: "Send report",
      run: () => onOpenReport(j.id),
    });
  }
  if (docAviso) {
    pendencias.push({
      id: "doc",
      tone: "warn",
      icon: "shield-alert",
      title: docAviso.name,
      text: docAviso.warning ?? "Needs your attention.",
      cta: "Upload",
      run: () => onNav("money:docs"),
    });
  }

  const payout = pay?.pending
    ? { label: "Next payout", date: pay.pending.payRunYmd, amount: pay.pending.net, range: formatPeriodRange(pay.pending.startYmd, pay.pending.endYmd) }
    : pay?.current
      ? {
          label: "This period",
          date: pay.current.payRunYmd,
          amount: pay.current.osNet,
          range: formatPeriodRange(pay.current.startYmd, pay.current.endYmd),
        }
      : null;

  const offerRows = [
    ...offers.jobs.map((o) => ({
      id: `j-${o.id}`,
      kind: "job" as const,
      title: o.title,
      meta: [o.timing, o.postcode, o.total > 0 ? formatGBPdec(o.total) : null].filter(Boolean).join(" · "),
    })),
    ...offers.quotes.map((q) => ({
      id: `q-${q.id}`,
      kind: "quote" as const,
      title: q.title,
      meta: [q.deadline ? `Quote by ${q.deadline}` : "Quote", q.postcode].filter(Boolean).join(" · "),
    })),
  ].slice(0, 4);
  const offersTotal = offers.jobs.length + offers.quotes.length;

  const firstName = partner.firstName?.trim();
  const dataHoje = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

  return (
    <div data-screen-scroll style={{ flex: 1, overflow: "auto", padding: isMobile ? 16 : "20px 24px 56px", fontFamily: T.sans }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <UViewHead
          help="Review today’s jobs, outstanding reports, new offers and your next payment."
          title={isMobile ? "Today" : `${greeting()}${firstName ? `, ${firstName}` : ""}`}
          meta={
            isMobile
              ? dataHoje
              : `${dataHoje}${v.hoje > 0 ? ` · ${v.hoje} ${v.hoje === 1 ? "job" : "jobs"} today` : ""}`
          }
          actions={isMobile ? undefined : <UButton variant="secondary" icon="calendar" onClick={() => onNav("settings:availability")}>Set availability</UButton>}
        />

        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <Metric tone="info" icon="briefcase" label="Jobs today" value={loading ? "" : String(v.hoje)} onClick={() => onNav("jobs")} />
            <Metric tone="coral" icon="inbox" label="New offers" value={offers.loaded ? String(offersTotal) : ""} onClick={() => onNav("offers")} />
            <Metric tone="warn" icon="camera" label="Reports to send" value={loading ? "" : String(v.reports.length)} onClick={() => onNav("jobs")} />
            <Metric
              tone="ok"
              icon="wallet"
              label={payout ? `${payout.label} · ${formatPayRunDate(payout.date)}` : "Next payout"}
              value={payout && payout.amount != null ? formatGBPdec(payout.amount) : ""}
              onClick={() => onNav("money")}
            />
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.55fr) minmax(300px, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {pendencias.map((p) => (
              <Banner key={p.id} {...p} />
            ))}

            {v.next ? (
              <NextJob job={v.next} today={today} onOpen={() => onOpenJob(v.next!.id)} />
            ) : (
              !loading && (
                <UCard style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <UTile tone="neutral" icon="calendar-check" />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No jobs booked</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: UNO.ink3 }}>New offers in your area show up under Offers.</p>
                  </div>
                  <UButton variant="secondary" onClick={() => onNav("offers")}>See offers</UButton>
                </UCard>
              )
            )}

            {v.seguintes.length > 0 && (
              <UCard padded={false}>
                <UCardHead title="Coming up" action={<ULinkButton onClick={() => onNav("jobs")}>All jobs</ULinkButton>} />
                {v.seguintes.map((j, i) => (
                  <UpcomingRow key={j.uuid} job={j} today={today} last={i === v.seguintes.length - 1} onClick={() => onOpenJob(j.id)} />
                ))}
              </UCard>
            )}

            {isMobile && payout && (
              <button
                type="button"
                onClick={() => onNav("money")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                  background: T.white,
                  border: `1px solid ${T.line}`,
                  borderRadius: 12,
                  boxShadow: UNO.shadowCard,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: T.sans,
                  color: T.ink,
                }}
              >
                <UTile tone="ok" icon="wallet" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: UNO.ink2 }}>
                    {payout.label} · {formatPayRunDate(payout.date)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                    {payout.amount != null ? formatGBPdec(payout.amount) : payout.range}
                  </p>
                </div>
                <Icon name="chevron-right" size={16} color={UNO.ink4} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {(offerRows.length > 0 || !isMobile) && (
              <UCard padded={false}>
                <UCardHead
                  title={offersTotal > 0 ? `New offers · ${offersTotal}` : "New offers"}
                  action={<ULinkButton onClick={() => onNav("offers")}>See all</ULinkButton>}
                />
                {offerRows.length === 0 ? (
                  <p style={{ margin: 0, padding: 16, fontSize: 13, color: UNO.ink3 }}>
                    {offers.loaded ? "Nothing new right now. We tell you by email when a job comes up." : ""}
                  </p>
                ) : (
                  offerRows.map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onNav(o.kind === "quote" ? "offers:quotes" : "offers:jobs")}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        border: "none",
                        borderBottom: i === offerRows.length - 1 ? "none" : `1px solid ${UNO.lineSoft}`,
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontFamily: T.sans,
                      }}
                    >
                      <UTile tone={o.kind === "quote" ? "coral" : "info"} icon={o.kind === "quote" ? "file-text" : "wrench"} size={32} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink }}>{o.title}</span>
                        <span style={{ display: "block", fontSize: 12, color: UNO.ink3 }}>{o.meta}</span>
                      </span>
                      <Icon name="chevron-right" size={16} color={UNO.ink4} />
                    </button>
                  ))
                )}
              </UCard>
            )}

            {!isMobile && docs && docs.length > 0 && (
              <UCard style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Documents</span>
                  {docs.some((d) => d.warning) ? (
                    <UChip tone="warn">{docs.filter((d) => d.warning).length} to renew</UChip>
                  ) : (
                    <UChip tone="ok" icon="check">Up to date</UChip>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {docs.slice(0, 5).map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 8, height: 8, borderRadius: 999, background: d.warning ? TONES.warn.base : d.status === "verified" ? TONES.ok.base : UNO.ink4, flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>{d.name}</span>
                      <span style={{ fontSize: 12, color: d.warning ? TONES.warn.ink : UNO.ink3, fontWeight: d.warning ? 500 : 400 }}>
                        {d.warning ? "Renew" : d.status === "verified" ? "Valid" : "In review"}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <UButton variant="secondary" onClick={() => onNav("money:docs")}>Manage documents</UButton>
                </div>
              </UCard>
            )}
          </div>
        </div>

        {previewMode && (
          <p style={{ margin: 0, fontSize: 12, color: UNO.ink3 }}>Your account is paused, so job details are hidden.</p>
        )}
      </div>
    </div>
  );
}

function Metric({ tone, icon, label, value, onClick }: { tone: Tone; icon: string; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: T.white,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        boxShadow: UNO.shadowCard,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: T.sans,
        minWidth: 0,
      }}
    >
      <UTile tone={tone} icon={icon} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, color: UNO.ink2 }}>{label}</span>
        <span style={{ display: "block", minHeight: 26, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: T.ink, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
      </span>
    </button>
  );
}

function Banner({ tone, icon, title, text, cta, run }: Pendencia) {
  const t = TONES[tone];
  return (
    <div style={{ background: t.bg, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Icon name={icon} size={16} color={t.ink} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.ink }}>{title}</p>
        <p style={{ margin: 0, fontSize: 12, color: t.ink }}>{text}</p>
      </div>
      <UButton onClick={run}>{cta}</UButton>
    </div>
  );
}

function NextJob({ job, today, onOpen }: { job: MyJob; today: string; onOpen: () => void }) {
  const inicio = londonHM(job.scheduledStartAt);
  const fim = londonHM(job.scheduledEndAt);
  const quando = job.scheduledDate === today ? startsIn(job.scheduledStartAt) : null;
  const dia = dayTag(job.scheduledDate, today);
  const nav = mapsUrl(job);
  const linhaTopo = [
    job.status === "in_progress" ? "In progress" : "Next job",
    job.status === "in_progress" ? null : quando ?? (dia.today ? "today" : job.scheduleStartLabel ?? dia.label),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      style={{
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexWrap: "wrap",
        background: T.navy,
        color: T.white,
        boxShadow: "0 2px 6px -2px rgba(10,10,31,0.25)",
      }}
    >
      <div
        style={{
          flex: "1 1 140px",
          padding: 20,
          background: UNO.nav,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: "#FFB08A" }}>{linhaTopo}</span>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          {inicio ?? job.scheduleArrivalLabel ?? "TBC"}
        </span>
        {fim && inicio ? <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>to {fim}</span> : null}
      </div>
      <div style={{ flex: "999 1 240px", padding: 20, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{job.title}</p>
          {job.customer.address ? (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{job.customer.address}</p>
          ) : null}
        </div>
        <div className="fx-keep-grid" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UButton variant="white" height={40} onClick={onOpen}>Open job</UButton>
          {nav ? (
            <UButton variant="ghost-on-navy" icon="navigation" height={40} href={nav}>
              Navigate
            </UButton>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UpcomingRow({ job, today, last, onClick }: { job: MyJob; today: string; last: boolean; onClick: () => void }) {
  const dia = dayTag(job.scheduledDate, today);
  const hora = londonHM(job.scheduledStartAt);
  const chip: { tone: Tone; label: string; icon?: string } = job.needsAttention
    ? { tone: "bad", label: job.onHoldLabel ?? "On hold", icon: "message-square-warning" }
    : job.status === "in_progress"
      ? { tone: "info", label: "In progress" }
      : { tone: "neutral", label: "Booked" };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        minHeight: 56,
        border: "none",
        borderBottom: last ? "none" : `1px solid ${UNO.lineSoft}`,
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: T.sans,
      }}
    >
      <span
        style={{
          width: 48,
          height: 40,
          borderRadius: 8,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: dia.today ? TONES.info.bg : UNO.pick,
          color: dia.today ? TONES.info.ink : UNO.ink2,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600 }}>{dia.label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{hora ?? "TBC"}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink }}>{job.title}</span>
        <span style={{ display: "block", fontSize: 12, color: UNO.ink3 }}>{[area(job), job.scheduleArrivalLabel].filter(Boolean).join(" · ")}</span>
      </span>
      <UChip tone={chip.tone} icon={chip.icon}>
        {chip.label}
      </UChip>
    </button>
  );
}
