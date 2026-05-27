// Fuzzy match a partner trade label against a service_catalog service name.
// Mirrors master-os partner-type-of-work-match: the catalog uses profession nouns
// ("Plumber", "Electrician", "Carpenter", "Painter") while the portal uses activity labels
// ("Plumbing", "Electrical", "Light Carpentry", "Painting & Decorating"), so an exact match
// misses almost everything — we use synonym groups + substring + word matching.

const SYNONYM_GROUPS: readonly string[][] = [
  ["carpenter", "carpentry", "carpenters", "joiner", "joinery"],
  ["plumber", "plumbing", "plumbers"],
  ["electrician", "electrical", "electrics"],
  ["builder", "building", "builders"],
  ["painter", "painting", "painters", "decorator", "decorating"],
  ["cleaner", "cleaning"],
  ["gardener", "gardening", "landscaper", "landscaping"],
  ["tiler", "tiling", "tiles"],
  ["plasterer", "plastering"],
  ["flooring", "floorer", "floor", "floors"],
];

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function synonymHit(a: string, b: string): boolean {
  for (const g of SYNONYM_GROUPS) {
    const hitA = g.some((w) => a === w || a.includes(w) || w.includes(a));
    const hitB = g.some((w) => b === w || b.includes(w) || w.includes(b));
    if (hitA && hitB) return true;
  }
  return false;
}

/** True if a partner trade label and a catalog service name refer to the same trade. */
export function tradeMatchesService(tradeLabel: string, serviceName: string): boolean {
  const t = norm(tradeLabel);
  const s = norm(serviceName);
  if (!t || !s) return false;
  if (t === s) return true;
  if (t.includes(s) || s.includes(t)) return true;
  if (synonymHit(t, s)) return true;
  const tw = t.split(/[\s/,&-]+/).filter((w) => w.length >= 3);
  const sw = s.split(/[\s/,&-]+/).filter((w) => w.length >= 3);
  for (const a of tw) for (const b of sw) {
    if (a.includes(b) || b.includes(a)) return true;
    if (synonymHit(a, b)) return true;
  }
  return false;
}

/** True if the service name matches ANY of the partner's trade labels. */
export function serviceMatchesAnyTrade(serviceName: string, trades: string[]): boolean {
  return trades.some((t) => tradeMatchesService(t, serviceName));
}
