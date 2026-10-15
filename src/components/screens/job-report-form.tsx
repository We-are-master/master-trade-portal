"use client";

/**
 * Aba Report do portal (15/10/2026: "uma porta só"). Mostra DENTRO da gaveta o
 * formulário do OS, o mesmo que o e-mail abre: foto subindo na hora, rascunho salvo
 * no celular, a checagem do cliente (Housekeep e outros) antes de enviar, e a mesma
 * gravação. O parceiro não sai do portal e a regra mora num lugar só.
 */

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import type { MyJob } from "@/types";
import type { ToastInput } from "@/components/ui/toast";

type ShowToast = (t: ToastInput) => void;

type Estado = { url: string; osOrigin: string; submitted: boolean; cancelled: boolean };

export function JobReportForm({ job, onShowToast }: { job: MyJob; onShowToast: ShowToast; onClose: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/jobs/report-link?jobId=${encodeURIComponent(job.uuid)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Partial<Estado> & { error?: string };
        if (!vivo) return;
        if (!r.ok || !j.url || !j.osOrigin) setErro(j.error ?? "Could not open the report form.");
        else setEstado({ url: j.url, osOrigin: j.osOrigin, submitted: !!j.submitted, cancelled: !!j.cancelled });
      })
      .catch(() => {
        if (vivo) setErro("Could not open the report form. Check your signal and try again.");
      });
    return () => {
      vivo = false;
    };
  }, [job.uuid]);

  // O formulário do OS avisa quando o report foi enviado.
  useEffect(() => {
    if (!estado) return;
    const ouvir = (ev: MessageEvent) => {
      if (ev.origin !== estado.osOrigin) return;
      if ((ev.data as { type?: string } | null)?.type === "fixfy-report-submitted") {
        setEnviado(true);
        onShowToast({ text: "Report sent. Thank you!", tone: "success" });
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [estado, onShowToast]);

  const caixa = { border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, background: T.white } as const;
  const aviso = (titulo: string, texto: string) => (
    <div style={caixa}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.ink }}>{titulo}</p>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: T.mute }}>{texto}</p>
    </div>
  );

  if (erro) return aviso("Report form unavailable", erro);
  if (!estado) return aviso("Preparing the report form…", "One moment.");
  if (estado.cancelled) return aviso("This job was cancelled", "No report is needed. Thank you.");
  if (estado.submitted || enviado) return aviso("Report sent", "We have your report for this job. The team will review it shortly.");

  return (
    <iframe
      title={`Report for ${job.id}`}
      src={estado.url}
      allow="camera"
      style={{ width: "100%", height: "calc(100dvh - 220px)", minHeight: 520, border: `1px solid ${T.line}`, borderRadius: 12, background: T.white }}
    />
  );
}
