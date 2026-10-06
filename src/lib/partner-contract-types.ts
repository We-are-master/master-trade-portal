/**
 * Partner contract types shown in the trade portal onboarding / policies step.
 *
 * The keys are `contract_versions.contract_type` values shared with master-os, so
 * they keep their old names. From version 2026-10-06 (agent model):
 *   - contractor_service_agreement carries the Partner Agreement;
 *   - terms_of_use carries the Partner Terms of Use;
 *   - self_bill_agreement carries the Invoicing and Payment Collection Agreement
 *     (with Annex 1, the VAT Status Declaration).
 */
export const PARTNER_CONTRACT_TYPES = [
  "terms_of_use",
  "self_bill_agreement",
  "contractor_service_agreement",
] as const;

export type PartnerContractType = (typeof PARTNER_CONTRACT_TYPES)[number];

/** Fallback titles (the live title comes from contract_versions.title). */
export const PARTNER_CONTRACT_TITLES: Record<PartnerContractType, string> = {
  terms_of_use: "Partner Terms of Use",
  self_bill_agreement: "Invoicing and Payment Collection Agreement",
  contractor_service_agreement: "Partner Agreement",
};

/** Order the partner reads and signs them in. */
export const PARTNER_CONTRACT_SIGNING_ORDER: PartnerContractType[] = [
  "contractor_service_agreement",
  "terms_of_use",
  "self_bill_agreement",
];

/** The agreement whose Annex 1 is the VAT Status Declaration. */
export const INVOICING_CONTRACT_TYPE: PartnerContractType = "self_bill_agreement";
