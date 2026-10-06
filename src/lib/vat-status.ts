// The partner's VAT status, confirmed when they sign the agreements.
//
// The legal declaration is Annex 1 (VAT Status Declaration) of the Invoicing
// and Payment Collection Agreement, version 2026-10-06: Fixfy issues receipts
// to customers in the partner's name, with or without VAT, on the strength of
// it. The answer is stored on the existing `partners.vat_registered` and
// `partners.vat_number` columns and printed on the signed agreement PDF.
//
// Shared by the browser (validation) and /api/contracts/sign-all (storage).

export type VatStatus = { registered: false; number: null } | { registered: true; number: string };

/** What the form holds while the partner is still choosing. */
export type VatStatusDraft = { registered: boolean | null; number: string };

export const VAT_NOT_REGISTERED_LABEL = "I am not VAT registered";
export const VAT_REGISTERED_LABEL = "I am VAT registered";

/** "gb 123 4567 89" → "GB123456789". */
export function normaliseVatNumber(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-]/g, "");
}

/** UK VAT number: 9 digits (or 12 for a group), optionally prefixed GB (or XI). */
export function isValidUkVatNumber(raw: string): boolean {
  return /^(GB|XI)?(\d{9}|\d{12})$/.test(normaliseVatNumber(raw));
}

/** A complete, valid answer, or null while something is missing. */
export function vatStatusFromDraft(draft: VatStatusDraft): VatStatus | null {
  if (draft.registered === false) return { registered: false, number: null };
  if (draft.registered === true && isValidUkVatNumber(draft.number)) {
    return { registered: true, number: normaliseVatNumber(draft.number) };
  }
  return null;
}

/** Server side: parse the JSON the browser sent. */
export function parseVatStatus(input: unknown): VatStatus | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { registered?: unknown; number?: unknown };
  if (o.registered === false) return { registered: false, number: null };
  if (o.registered === true && typeof o.number === "string") {
    return vatStatusFromDraft({ registered: true, number: o.number });
  }
  return null;
}

/** Wording of Annex 1 for the signed PDF and the audit log. */
export function vatStatusDeclarationLines(status: VatStatus): string[] {
  const choice = status.registered
    ? `I declare that the Partner is registered for VAT. VAT registration number: ${status.number}.`
    : "I declare that the Partner is not a VAT-registered person. To the best of the Partner's knowledge, it is not currently required to register for VAT.";
  return [
    choice,
    "The Partner will tell Fixfy in writing within 14 days of any change to its VAT status, including registering for VAT, stopping being registered, changing its VAT registration number, changing its legal form or selling or transferring its business, and will sign a new declaration.",
    "The Partner understands that Fixfy relies on this declaration to issue receipts and invoices to Customers in the Partner's name for Platform Bookings, and self-bills for Fixfy Client Work, and that it is responsible for any VAT due on its own supplies.",
  ];
}

export const VAT_DECLARATION_TITLE = "Annex 1: VAT Status Declaration";
