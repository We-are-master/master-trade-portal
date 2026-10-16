"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T } from "@/lib/tokens";

/** Contextual help shared by page and card headings. Never submits a form. */
export function HelpHint({ label, text }: { label: string; text: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 24);
      const height = popup.current?.offsetHeight ?? 100;
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: rect.bottom + height + 20 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8),
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-label={`About ${label}`} aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, padding: 0, border: `1px solid ${T.line}`, borderRadius: "50%", background: T.white, color: T.navy, fontSize: 13, fontWeight: 600, cursor: "help", verticalAlign: "middle" }}>
      <span aria-hidden="true">!</span>
    </button>
    {open && createPortal(<div ref={popup} onMouseEnter={show} onMouseLeave={leave} id={id} role="tooltip" style={{ position: "fixed", ...position, zIndex: 10000, width: "min(300px, calc(100vw - 24px))", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, background: T.navy, color: T.white, fontFamily: T.sans, fontSize: 13, fontWeight: 400, lineHeight: 1.5, boxShadow: "0 4px 18px #0003" }}>{text}</div>, document.body)}
  </>;
}
