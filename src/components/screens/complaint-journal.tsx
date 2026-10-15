"use client";

/**
 * Journal da reclamação no portal (15/10/2026): a conversa com o escritório sobre a
 * reclamação, registrada no job, no mesmo formato do OS (Date and time | Message, mais
 * nova em cima). O parceiro responde com texto e fotos; tudo aparece no OS.
 */

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { Button } from "@/components/ui/primitives";
import type { MyJob } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type Mensagem = { id: string; author: string; authorName: string | null; body: string | null; photos: string[]; at: string };
type Dados = { complaint: { text: string; at: string | null } | null; messages: Mensagem[] };

const quando = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "";

/** Foto do celular encolhida antes de subir: 1600px no lado maior, JPEG 0,75. */
async function encolher(f: File): Promise<File> {
  if (!f.type.startsWith("image/")) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.75));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

export function ComplaintJournal({ job, onShowToast }: { job: MyJob; onShowToast: (t: ToastInput) => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/jobs/complaint-messages?jobId=${encodeURIComponent(job.uuid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dados | null) => {
        if (vivo && d) setDados(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [job.uuid, recarga]);

  const enviar = async () => {
    if (!texto.trim() && fotos.length === 0) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("jobId", job.uuid);
      form.set("body", texto.trim());
      for (const f of fotos) form.append("photos[]", await encolher(f));
      const r = await fetch("/api/jobs/complaint-messages", { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not send. Try again.");
      setTexto("");
      setFotos([]);
      setRecarga((n) => n + 1);
      onShowToast({ text: "Sent to the Fixfy team", tone: "success" });
    } catch (e) {
      onShowToast({ text: e instanceof Error ? e.message : "Could not send. Try again.", tone: "error" });
    } finally {
      setEnviando(false);
    }
  };

  if (!dados) return null;
  const linhas: Array<{ id: string; at: string | null; quem: string; papel: string; body: string | null; photos: string[] }> = [
    ...(dados.complaint ? [{ id: "complaint", at: dados.complaint.at, quem: "Customer", papel: "Complaint", body: dados.complaint.text, photos: [] as string[] }] : []),
    ...dados.messages.map((m) => ({
      id: m.id,
      at: m.at,
      quem: m.author === "partner" ? "You" : m.authorName || "Fixfy",
      papel: m.author === "partner" ? "Partner" : "Fixfy",
      body: m.body,
      photos: m.photos,
    })),
  ].sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));

  const th = { textAlign: "left", fontSize: 12, fontWeight: 600, color: T.ink, padding: "8px 12px", borderBottom: `1px solid ${T.line}` } as const;
  const td = { fontSize: 13, color: T.ink, padding: "10px 12px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top" } as const;

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, background: T.white, overflow: "hidden" }}>
      <div style={{ padding: "12px 12px 0", fontSize: 14, fontWeight: 600, color: T.ink }}>Complaint journal</div>
      <div style={{ margin: 12, border: `1px solid ${T.line}`, borderRadius: 10, padding: 10 }}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Reply to the Fixfy team: what happened, what you can do"
          style={{ width: "100%", border: 0, outline: "none", resize: "vertical", fontSize: 13, color: T.ink, background: "transparent" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.coral, cursor: "pointer" }}>
            Add photos{fotos.length ? ` (${fotos.length})` : ""}
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => setFotos((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 10))}
            />
          </label>
          <div style={{ marginLeft: "auto" }}>
            <Button variant="primary" size="sm" onClick={() => void enviar()} disabled={enviando || (!texto.trim() && fotos.length === 0)}>
              {enviando ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 130 }}>Date and time</th>
            <th style={th}>Message</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td style={{ ...td, fontSize: 12, color: T.mute, whiteSpace: "nowrap" }}>{quando(l.at)}</td>
              <td style={td}>
                <div style={{ fontSize: 11, fontWeight: 600, color: l.papel === "Complaint" ? "#C8102E" : l.papel === "Partner" ? "#2563EB" : T.mute, marginBottom: 2 }}>
                  {l.quem} · {l.papel}
                </div>
                {l.body ? <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{l.body}</div> : null}
                {l.photos.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {l.photos.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
