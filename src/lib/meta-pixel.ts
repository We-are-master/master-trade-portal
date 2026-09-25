// Pixel da Meta no cadastro de parceiro (/get-started).
//
// Só carrega depois do "Accept" no banner (PECR: cookie de anúncio precisa do
// sim antes). Quem recusa ou ainda não respondeu não manda nada. Dois eventos
// importam para a campanha de recrutamento:
//   Lead                 dados de contato salvos (passo "lead")
//   CompleteRegistration contratos assinados (fim do cadastro)
// Cada um sai uma vez por navegador (a chave fica no localStorage), então
// voltar ao passo ou recarregar não conta de novo.

const PIXEL_ID = "1555218078932742";
const CONSENT_KEY = "fx_mkt_consent";
const SENT_PREFIX = "fx_px_sent:";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export type Consent = "yes" | "no" | null;

export function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(v: "yes" | "no") {
  try {
    window.localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* modo privado: vale só nesta página */
  }
  if (v === "yes") loadPixel();
}

let loaded = false;

const CLICK_KEY = "fx_fbclid";

/** Guarda o fbclid da URL de chegada (sessionStorage, não é cookie). */
export function rememberClickId() {
  try {
    const id = new URLSearchParams(window.location.search).get("fbclid");
    if (id) window.sessionStorage.setItem(CLICK_KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* sem storage: segue sem o clique */
  }
}

/** Com o sim, grava o _fbc que o pixel leria da URL (formato fb.1.<ms>.<fbclid>). */
function restoreClickCookie() {
  try {
    if (document.cookie.includes("_fbc=")) return;
    const raw = window.sessionStorage.getItem(CLICK_KEY);
    if (!raw) return;
    const { id, at } = JSON.parse(raw) as { id: string; at: number };
    if (!id) return;
    const d = new Date(Date.now() + 90 * 86400e3).toUTCString();
    document.cookie = `_fbc=fb.1.${at}.${id}; expires=${d}; path=/; SameSite=Lax; Secure`;
  } catch {
    /* segue sem o clique */
  }
}

export function loadPixel() {
  if (loaded || typeof window === "undefined" || readConsent() !== "yes") return;
  loaded = true;
  restoreClickCookie();
  // Snippet oficial da Meta, sem o <noscript>.
  const f = window;
  if (!f.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue?.push(args);
    } as Fbq;
    n.queue = [];
    n.loaded = true;
    n.version = "2.0";
    n.push = n;
    f.fbq = n;
    f._fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  f.fbq!("init", PIXEL_ID);
  f.fbq!("track", "PageView");
}

/** Manda o evento uma vez por navegador. Sem consentimento, não faz nada. */
export function trackOnce(event: "Lead" | "CompleteRegistration", params: Record<string, string> = {}) {
  if (typeof window === "undefined" || readConsent() !== "yes") return;
  const key = SENT_PREFIX + event;
  try {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* sem storage: manda assim mesmo */
  }
  loadPixel();
  window.fbq?.("track", event, { content_category: "partner_signup", ...params });
}
