"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";
import type { MyJob } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

const MAX_PHOTOS = 12;
const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 10,
  borderRadius: 8,
  border: `1px solid ${T.line}`,
  fontFamily: T.sans,
  fontSize: 13,
  color: T.ink,
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  background: T.white,
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

/** "2026-09-15" vira "Mon 15 Sep". O parceiro deu o DIA, não a janela. */
function formatarDia(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

/** Hoje em YYYY-MM-DD, para o `min` do calendário não deixar escolher ontem. */
function hojeYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

const inputDataStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "9px 10px",
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  background: T.white,
  color: T.ink,
  fontSize: 13,
  fontFamily: "inherit",
};

export function OnHoldResponseForm({
  job,
  compact = false,
  onShowToast,
  onSubmitted,
}: {
  job: MyJob;
  compact?: boolean;
  onShowToast: ShowToast;
  onSubmitted: () => void;
}) {
  const [notes, setNotes] = useState("");
  /**
   * Quando ele pode voltar. Duas caixas, porque é o que o cliente vai receber:
   * o escritório oferece DUAS datas, e pedir uma lista aberta devolve "qualquer
   * dia" ou nada. A segunda é opcional; uma data já é melhor que nenhuma, que é
   * o que a gente tem hoje.
   */
  const [datasEnviadas, setDatasEnviadas] = useState<string[]>([]);
  /**
   * O que ele oferece. Nasce vazio de propósito: a escolha é a primeira
   * pergunta, e sem ela o resto do formulário não faz sentido. Desconto não
   * pede data (ninguém volta) e voltar não pede valor.
   */
  const [remedy, setRemedy] = useState<"revisit" | "discount" | null>(null);
  const [data1, setData1] = useState("");
  const [slot1, setSlot1] = useState<"morning" | "afternoon">("morning");
  const [data2, setData2] = useState("");
  const [slot2, setSlot2] = useState<"morning" | "afternoon">("afternoon");
  const [desconto, setDesconto] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alreadySubmitted, setAlreadySubmitted] = useState(Boolean(job.onHoldSubmissionAt));
  const [submittedAt, setSubmittedAt] = useState(job.onHoldSubmissionAt);
  const [onHoldReason, setOnHoldReason] = useState(job.onHoldComplaintDescription ?? job.onHoldReason ?? "");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/on-hold-response?jobId=${encodeURIComponent(job.uuid)}`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          if (json.onHoldReason) setOnHoldReason(json.onHoldReason);
          if (json.alreadySubmitted) {
            setAlreadySubmitted(true);
            setSubmittedAt(json.submittedAt ?? job.onHoldSubmissionAt);
            setDatasEnviadas(Array.isArray(json.submittedDates) ? json.submittedDates : []);
          }
        }
      } catch {
        /* use job fields */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.uuid, job.onHoldSubmissionAt]);

  const previews = useMemo(() => photos.map((f) => ({ url: URL.createObjectURL(f), name: f.name })), [photos]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    setPhotos((prev) => [...prev, ...Array.from(files)].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!remedy) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: "Choose whether you'll go back or offer a discount." });
      return;
    }
    if (!notes.trim()) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: "Please describe what happened." });
      return;
    }
    if (remedy === "revisit" && !(data1.trim() && data2.trim())) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: "Give two windows: one option is not a choice for the customer." });
      return;
    }
    if (remedy === "discount" && !(Number(desconto) > 0)) {
      onShowToast({ icon: "alert-triangle", tone: "coral", text: "Enter the discount amount in pounds." });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("jobId", job.uuid);
      form.append("notes", notes.trim());
      form.append("remedy", remedy);
      if (remedy === "revisit") {
        for (const [d, sl] of [[data1, slot1], [data2, slot2]] as const) {
          if (d.trim()) form.append("offers[]", `${d.trim()}|${sl}`);
        }
      } else {
        form.append("discount_gbp", String(Number(desconto)));
      }
      photos.forEach((file, i) => form.append("photos[]", file, file.name || `photo-${i}.jpg`));

      const res = await fetch("/api/jobs/on-hold-response", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send your response");

      onShowToast({ icon: "send", text: "Response sent — Fixfy will review and get back to you." });
      setAlreadySubmitted(true);
      setSubmittedAt(new Date().toISOString());
      setDatasEnviadas(Array.isArray(json.availableDates) ? json.availableDates : []);
      setNotes("");
      setRemedy(null);
      setData1("");
      setData2("");
      setDesconto("");
      setPhotos([]);
      onSubmitted();
    } catch (e) {
      onShowToast({
        icon: "alert-triangle",
        tone: "coral",
        text: e instanceof Error ? e.message : "Couldn't send your response",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: T.mute, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="loader" size={13} /> Loading…
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div
        style={{
          padding: compact ? 10 : 12,
          borderRadius: 8,
          background: T.green50,
          border: `1px solid ${T.green}`,
          fontSize: 12.5,
          color: T.ink,
          lineHeight: 1.45,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: T.green, marginBottom: 4 }}>
          <Icon name="check-circle" size={14} /> Response sent
        </div>
        Awaiting Fixfy review{submittedAt ? ` · ${fmtWhen(submittedAt)}` : ""}. The job stays here until the office resumes it.
        {datasEnviadas.length > 0 ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: 0.4 }}>
              You said you can return
            </span>
            {datasEnviadas.map((d) => (
              <span
                key={d}
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: `1px solid ${T.green}`,
                  background: T.white,
                  color: T.green,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {formatarDia(d)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }} onClick={(e) => e.stopPropagation()}>
      {onHoldReason ? (
        <div
          style={{
            padding: compact ? 8 : 10,
            borderRadius: 8,
            background: T.paper,
            border: `1px solid ${T.line}`,
            fontSize: 12,
            color: T.slate,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
            What was reported
          </div>
          {onHoldReason}
        </div>
      ) : null}

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
          What are you offering? *
        </label>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          {([
            ["revisit", "Go back and put it right", "No extra cost to the customer"],
            ["discount", "Offer a discount", "We reduce the invoice instead"],
          ] as const).map(([valor, titulo, ajuda]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setRemedy(valor)}
              aria-pressed={remedy === valor}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                background: remedy === valor ? T.paper : T.white,
                border: `1.5px solid ${remedy === valor ? T.coral : T.line}`,
                color: T.ink,
                font: "inherit",
              }}
            >
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{titulo}</span>
              <span style={{ display: "block", fontSize: 11, color: T.mute, marginTop: 2 }}>{ajuda}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
          What happened? *
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What went wrong and what you'll do about it…"
          style={{ ...textareaStyle, minHeight: compact ? 70 : 90 }}
        />
      </div>

      {remedy === "revisit" ? (
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
            When can you go back? *
          </label>
          <div style={{ fontSize: 11, color: T.mute, marginBottom: 6 }}>
            Two windows, both required. The customer picks one, so only put times you can really do.
          </div>
          {([
            [1, data1, setData1, slot1, setSlot1],
            [2, data2, setData2, slot2, setSlot2],
          ] as const).map(([n, dia, setDia, turno, setTurno]) => (
            <div key={n} style={{ display: "flex", gap: 8, marginBottom: n === 1 ? 8 : 0 }}>
              <input
                type="date"
                value={dia}
                min={n === 2 ? data1 || hojeYmd() : hojeYmd()}
                onChange={(e) => setDia(e.target.value)}
                aria-label={`Day for window ${n}`}
                style={{ ...inputDataStyle }}
              />
              <select
                value={turno}
                onChange={(e) => setTurno(e.target.value as "morning" | "afternoon")}
                aria-label={`Time for window ${n}`}
                style={{ ...inputDataStyle, flex: "0 0 42%" }}
              >
                <option value="morning">Morning · 8am to 1pm</option>
                <option value="afternoon">Afternoon · 1pm to 6pm</option>
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {remedy === "discount" ? (
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
            How much off? *
          </label>
          <div style={{ fontSize: 11, color: T.mute, marginBottom: 6 }}>
            In pounds. This comes off what we pay you for this job.
          </div>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder="40.00"
            aria-label="Discount amount in pounds"
            style={{ ...inputDataStyle, flex: "0 0 auto", width: 140 }}
          />
        </div>
      ) : null}

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
          When can you go back?
        </label>
        <div style={{ fontSize: 11, color: T.mute, marginBottom: 6 }}>
          Give one or two days. We offer these to the customer, so only put days you can really do.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={data1}
            min={hojeYmd()}
            onChange={(e) => setData1(e.target.value)}
            aria-label="First day you can go back"
            style={{ ...inputDataStyle }}
          />
          <input
            type="date"
            value={data2}
            min={data1 || hojeYmd()}
            onChange={(e) => setData2(e.target.value)}
            aria-label="Second day you can go back (optional)"
            style={{ ...inputDataStyle }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.ink, marginBottom: 6 }}>
          Photos (optional)
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {previews.map((p, i) => (
            <div key={p.url} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: 9999,
                  border: "none",
                  background: T.coral,
                  color: T.white,
                  fontSize: 12,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px dashed ${T.line}`,
                fontSize: 12,
                color: T.slate,
                cursor: "pointer",
              }}
            >
              <Icon name="image-plus" size={14} color={T.coral} />
              Add photos
              <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            </label>
          )}
        </div>
      </div>

      <Button variant="primary" size={compact ? "sm" : "md"} icon="send" onClick={submit} disabled={submitting} full>
        {submitting ? "Sending…" : "Submit resolution"}
      </Button>
    </div>
  );
}
