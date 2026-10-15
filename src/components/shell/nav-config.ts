// Navegação do portal (redesign 15/10/2026): quatro destinos e a conta no
// avatar. Sidebar (desktop) e barra de baixo (celular) leem daqui.

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", icon: "house" },
  { id: "offers", label: "Offers", icon: "inbox" },
  { id: "jobs", label: "My jobs", icon: "briefcase" },
  { id: "money", label: "Payments", icon: "wallet" },
];

export const PAGE_TITLES: Record<string, string> = {
  today: "Today",
  offers: "Offers",
  jobs: "My jobs",
  money: "Payments",
  settings: "Account",
};

/**
 * Rotas antigas que ainda chegam por link de e-mail (?screen=…) ou por código
 * que não mudou: cada uma cai no destino novo, com a sub-aba certa.
 */
const ALIASES: Record<string, string> = {
  dashboard: "today",
  available: "offers:jobs",
  opportunities: "offers",
  quotes: "offers:quotes",
  schedule: "jobs:calendar",
};

/** Sub-páginas da conta que mudaram para Money. */
const SETTINGS_MOVED: Record<string, string> = {
  selfbill: "money",
  docs: "money:docs",
};

export function normalizeRoute(route: string): string {
  const [page, sub] = route.split(":");
  if (page === "settings" && sub && SETTINGS_MOVED[sub]) return SETTINGS_MOVED[sub];
  const alias = ALIASES[page];
  if (!alias) return route;
  return sub && !alias.includes(":") ? `${alias}:${sub}` : alias;
}

/** Fixfy: o mesmo número atende ligação e WhatsApp (Zendesk Talk). */
export const FIXFY_PHONE_LABEL = "020 4538 4668";
export const FIXFY_PHONE_TEL = "tel:+442045384668";
export const FIXFY_WHATSAPP_URL = "https://wa.me/442045384668";
