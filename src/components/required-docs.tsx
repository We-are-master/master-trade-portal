"use client";

// The partner's document checklist (/api/partner/required-docs) with an upload
// row per document. Used by the /get-started documents step and by the review
// screen, where a partner who skipped that step uploads what's still missing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/lib/tokens";
import { Button, Icon } from "@/components/ui/primitives";

/** The funnel's draft code, sent along so uploads work before the session cookie sticks. */
export const ONBOARDING_DRAFT_STORAGE_KEY = "fixfy_onboarding_draft_code";

export type RequiredDoc = {
  id: string;
  docType: string;
  name: string;
  description: string;
  group: "core" | "legal" | "trade_cert";
  mandatory?: boolean;
  uploaded?: UploadedDoc | null;
};

export type UploadedDoc = { docId: string; fileName: string };

const GROUP_LABELS: Record<RequiredDoc["group"], string> = {
  core: "Identity & compliance",
  legal: "Business proof",
  trade_cert: "Trade certificates",
};

function draftCode(): string {
  try {
    return window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Loads the checklist, with what's already on file counted as uploaded. */
export function useRequiredDocs() {
  const [required, setRequired] = useState<RequiredDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, UploadedDoc>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // Prefer the session; if the cookie hasn't stuck, fall back to the
        // wizard's draft code so we still get the correct checklist.
        const code = draftCode();
        const url = code ? `/api/partner/required-docs?code=${encodeURIComponent(code)}` : "/api/partner/required-docs";
        const res = await fetch(url, { credentials: "same-origin" });
        const data = (await res.json().catch(() => ({}))) as { required?: RequiredDoc[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't load your document checklist.");
        if (!alive) return;
        const list = data.required ?? [];
        setRequired(list);
        const onFile: Record<string, UploadedDoc> = {};
        for (const d of list) if (d.uploaded) onFile[d.id] = d.uploaded;
        setUploaded((prev) => ({ ...onFile, ...prev }));
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Couldn't load your document checklist.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const markUploaded = useCallback((id: string, doc: UploadedDoc) => {
    setUploaded((prev) => ({ ...prev, [id]: doc }));
  }, []);

  const missingMandatory = useMemo(
    () => (required ?? []).filter((d) => d.mandatory !== false && !uploaded[d.id]),
    [required, uploaded],
  );

  return { required, loadError, uploaded, markUploaded, missingMandatory };
}

export function RequiredDocsList({
  required,
  loadError,
  uploaded,
  onUploaded,
}: {
  required: RequiredDoc[] | null;
  loadError: string | null;
  uploaded: Record<string, UploadedDoc>;
  onUploaded: (id: string, doc: UploadedDoc) => void;
}) {
  const groups = useMemo(() => {
    const order: RequiredDoc["group"][] = ["core", "legal", "trade_cert"];
    const by: Record<string, RequiredDoc[]> = {};
    for (const r of required ?? []) (by[r.group] ??= []).push(r);
    return order.filter((g) => by[g]?.length).map((g) => ({ group: g, docs: by[g] }));
  }, [required]);

  return (
    <>
      {loadError && <p style={{ color: T.red, fontSize: 14 }}>{loadError}</p>}
      {!required && !loadError && <p style={{ color: T.mute, fontSize: 14, textAlign: "center" }}>Loading your checklist…</p>}
      {groups.map(({ group, docs }) => (
        <div key={group} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: T.mute, marginBottom: 10 }}>
            {GROUP_LABELS[group]}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {docs.map((doc) => (
              <DocUploadRow
                key={doc.id}
                doc={doc}
                uploaded={uploaded[doc.id]}
                onUploaded={(docId, fileName) => onUploaded(doc.id, { docId, fileName })}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function DocUploadRow({
  doc,
  uploaded,
  onUploaded,
}: {
  doc: RequiredDoc;
  uploaded?: { docId: string; fileName: string };
  onUploaded: (docId: string, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setErr(null);
      setBusy(true);
      try {
        const form = new FormData();
        form.set("docType", doc.docType);
        form.set("name", doc.name);
        form.set("file", file);
        // Include the draft code so uploads work even when the OTP session
        // cookie hasn't been received yet by the server route handler.
        const code = draftCode();
        if (code) form.set("code", code);
        const res = await fetch("/api/partner/documents", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
        onUploaded(data.id ?? "", file.name);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [doc.docType, doc.name, onUploaded],
  );

  const isDone = Boolean(uploaded);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 13,
        border: `1px solid ${isDone ? "rgba(14,138,95,0.35)" : T.line}`,
        background: isDone ? T.green50 : T.white,
        boxShadow: "0 1px 2px rgba(2,0,64,0.05)",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDone ? T.white : T.paper,
          color: isDone ? T.green : T.slate,
        }}
      >
        <Icon name={isDone ? "check" : "file-text"} size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{doc.name}</div>
        <div style={{ fontSize: 12.5, color: T.mute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {err ? <span style={{ color: T.red }}>{err}</span> : uploaded ? uploaded.fileName : doc.description}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <Button variant={isDone ? "secondary" : "primary"} size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : isDone ? "Replace" : "Upload"}
      </Button>
    </div>
  );
}
