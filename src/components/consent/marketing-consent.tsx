"use client";

// Barra de cookies do cadastro de parceiro. Mesma regra do getfixfy.com:
// nada de anúncio antes da resposta, e Reject com o mesmo peso de Accept.

import { useEffect, useState } from "react";
import { loadPixel, readConsent, saveConsent } from "@/lib/meta-pixel";

export function MarketingConsent({ onAccept }: { onAccept?: () => void } = {}) {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (readConsent() === "yes") {
      loadPixel();
      return;
    }
    if (readConsent() === null) {
      const t = setTimeout(() => setAberta(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!aberta) return null;

  const escolher = (v: "yes" | "no") => {
    saveConsent(v);
    setAberta(false);
    if (v === "yes") onAccept?.();
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie choice"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 9999,
        maxWidth: 560,
        margin: "0 auto",
        background: "#fff",
        border: "1px solid #e3e3ee",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(2,0,64,.14)",
        padding: "12px 14px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 14px",
      }}
    >
      <p style={{ margin: 0, flex: "1 1 220px", fontSize: 13.5, lineHeight: 1.45, color: "#3d3d5c" }}>
        We use cookies to measure our ads.{" "}
        <a href="https://www.getfixfy.com/cookies" target="_blank" rel="noreferrer" style={{ color: "#020040" }}>
          Cookie policy
        </a>
      </p>
      <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        <button type="button" onClick={() => escolher("no")} style={botao(false)}>
          Reject
        </button>
        <button type="button" onClick={() => escolher("yes")} style={botao(true)}>
          Accept
        </button>
      </div>
    </div>
  );
}

function botao(cheio: boolean): React.CSSProperties {
  return {
    minWidth: 96,
    padding: "9px 14px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    border: "1.5px solid #020040",
    background: cheio ? "#020040" : "#fff",
    color: cheio ? "#fff" : "#020040",
  };
}
