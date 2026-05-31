/**
 * JSON contract for `quote_bids.notes` — mirrors master-os/src/lib/quote-bid-payload.ts
 * so partner bids pre-fill the Fixfy OS customer proposal on approve.
 */
export type PartnerBidProposalPayload = {
  labour_cost?: number;
  materials_cost?: number;
  labour_description?: string;
  materials_description?: string;
  labour_pricing?: "hourly" | "fixed";
  labour_hours?: number;
  labour_rate?: number;
  materials_pricing?: "unit" | "bulk";
  materials_quantity?: number;
  materials_partner_unit?: number;
  start_date_option_1?: string;
  start_date_option_2?: string;
  deposit_required?: number;
  scope?: string;
};

const BID_JSON_PREFIX = "BID_JSON:";

export function bidPayloadTrimmedString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

export function parseBidProposalFromNotes(notes: string | undefined | null): PartnerBidProposalPayload | null {
  const t = bidPayloadTrimmedString(notes);
  if (!t) return null;
  const jsonSlice = t.startsWith(BID_JSON_PREFIX) ? t.slice(BID_JSON_PREFIX.length).trim() : t;
  if (!jsonSlice.startsWith("{")) return null;
  try {
    const j = JSON.parse(jsonSlice) as PartnerBidProposalPayload;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

export function serializeBidProposalNotes(payload: PartnerBidProposalPayload): string {
  return `${BID_JSON_PREFIX}${JSON.stringify(payload)}`;
}

/** YYYY-MM-DD from `<input type="date">` or ISO string. */
export function normalizeBidDateYmd(v: string | undefined | null): string {
  const t = bidPayloadTrimmedString(v);
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export type BidSubmitFormValues = {
  labourCost: string;
  materialsCost: string;
  labourDescription: string;
  materialsDescription: string;
  scope: string;
  startDate1: string;
  startDate2: string;
  coverNote: string;
};

export function bidFormValuesFromNotes(notes: string | undefined | null): Partial<BidSubmitFormValues> {
  const p = parseBidProposalFromNotes(notes);
  if (!p) {
    const plain = bidPayloadTrimmedString(notes);
    return plain ? { coverNote: plain } : {};
  }
  return {
    labourCost: p.labour_cost != null ? String(p.labour_cost) : "",
    materialsCost: p.materials_cost != null ? String(p.materials_cost) : "",
    labourDescription: p.labour_description ?? "",
    materialsDescription: p.materials_description ?? "",
    scope: p.scope ?? "",
    startDate1: normalizeBidDateYmd(p.start_date_option_1),
    startDate2: normalizeBidDateYmd(p.start_date_option_2),
    coverNote: "",
  };
}

export function buildBidProposalFromForm(values: BidSubmitFormValues): PartnerBidProposalPayload {
  const labour = Math.max(0, parseFloat(values.labourCost) || 0);
  const materials = Math.max(0, parseFloat(values.materialsCost) || 0);
  const payload: PartnerBidProposalPayload = {
    labour_cost: labour,
    materials_cost: materials,
    labour_description: bidPayloadTrimmedString(values.labourDescription),
    materials_description: bidPayloadTrimmedString(values.materialsDescription),
    scope: bidPayloadTrimmedString(values.scope),
    start_date_option_1: normalizeBidDateYmd(values.startDate1),
    start_date_option_2: normalizeBidDateYmd(values.startDate2),
    labour_pricing: "fixed",
    materials_pricing: "unit",
  };
  const cover = bidPayloadTrimmedString(values.coverNote);
  if (cover) {
    payload.scope = payload.scope ? `${payload.scope}\n\n${cover}` : cover;
  }
  return payload;
}

export function validateBidSubmitForm(values: BidSubmitFormValues): string | null {
  const labour = parseFloat(values.labourCost) || 0;
  const materials = parseFloat(values.materialsCost) || 0;
  if (labour + materials <= 0) {
    return "Enter a labour or materials amount before sending.";
  }
  if (!bidPayloadTrimmedString(values.labourDescription)) {
    return "Labour line notes are required — describe what is included.";
  }
  if (!bidPayloadTrimmedString(values.materialsDescription)) {
    return "Materials line notes are required — list materials or state none included.";
  }
  if (!bidPayloadTrimmedString(values.scope)) {
    return "Scope of work is required.";
  }
  const d1 = normalizeBidDateYmd(values.startDate1);
  const d2 = normalizeBidDateYmd(values.startDate2);
  if (!d1) return "Start date option 1 is required.";
  if (!d2) return "Start date option 2 is required.";
  if (d1 === d2) return "Please offer two different start date options.";
  return null;
}
