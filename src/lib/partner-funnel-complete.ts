// Checks whether the /get-started funnel collected everything the OS needs for review.

import {
  isPartnerRegistrationFieldMandatory,
  isPartnerRegistrationFieldVisible,
  mergePartnerRegistrationRules,
  type PartnerRegistrationRuleRow,
} from "@/lib/partner-registration-fields";
import { partnerCoverageIsComplete } from "@/lib/partner-coverage";
import {
  filterMandatoryRequiredDocs,
  missingFromChecklist,
  type PartnerDocLike,
  type PartnerDocRuleRow,
  type RequiredDocDef,
} from "@/lib/partner-required-docs";
import { PARTNER_CONTRACT_TYPES } from "@/lib/partner-contract-types";

/** Contract types that must be signed for OS compliance (excludes terms_of_use). */
export const COMPLIANCE_CONTRACT_TYPES = PARTNER_CONTRACT_TYPES.filter((t) => t !== "terms_of_use");

export type PartnerFunnelRow = {
  email?: string | null;
  phone?: string | null;
  partner_address?: string | null;
  location?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  partner_legal_type?: string | null;
  crn?: string | null;
  utr?: string | null;
  vat_registered?: boolean | null;
  vat_number?: string | null;
  catalog_service_ids?: string[] | null;
  coverage_mode?: string | null;
  service_radius_miles?: number | null;
  coverage_latitude?: number | null;
  coverage_longitude?: number | null;
  included_postcodes?: string[] | null;
};

function inferLegal(partner: PartnerFunnelRow): "limited_company" | "self_employed" {
  if (partner.partner_legal_type === "limited_company") return "limited_company";
  if (partner.partner_legal_type === "self_employed") return "self_employed";
  return partner.crn?.trim() ? "limited_company" : "self_employed";
}

function vatComplete(partner: PartnerFunnelRow, rules: PartnerRegistrationRuleRow[]): boolean {
  if (!isPartnerRegistrationFieldVisible("vat", rules)) return true;
  if (!isPartnerRegistrationFieldMandatory("vat", rules)) return true;
  const legal = inferLegal(partner);
  if (legal !== "limited_company") return true;
  const vr = partner.vat_registered;
  if (vr === false) return true;
  if (vr === true) return !!partner.vat_number?.trim();
  return !!partner.vat_number?.trim();
}

function fieldOk(id: string, value: boolean, rules: PartnerRegistrationRuleRow[]): boolean {
  if (!isPartnerRegistrationFieldVisible(id, rules)) return true;
  if (!isPartnerRegistrationFieldMandatory(id, rules)) return true;
  return value;
}

export function isPartnerProfileFunnelComplete(
  partner: PartnerFunnelRow,
  registrationRules?: PartnerRegistrationRuleRow[] | null,
): boolean {
  const rules = registrationRules ?? mergePartnerRegistrationRules(null);
  const legal = inferLegal(partner);
  const taxOk =
    !isPartnerRegistrationFieldVisible("tax_id", rules) ||
    !isPartnerRegistrationFieldMandatory("tax_id", rules) ||
    (legal === "limited_company" ? !!partner.crn?.trim() : !!partner.utr?.trim());

  return (
    fieldOk("account", !!partner.email?.trim(), rules) &&
    fieldOk("phone", !!partner.phone?.trim(), rules) &&
    fieldOk("address", !!(partner.partner_address?.trim() || partner.location?.trim()), rules) &&
    (!isPartnerRegistrationFieldVisible("coverage", rules) ||
      !isPartnerRegistrationFieldMandatory("coverage", rules) ||
      partnerCoverageIsComplete(partner)) &&
    taxOk &&
    vatComplete(partner, rules) &&
    fieldOk("account", !!(partner.company_name?.trim() && partner.contact_name?.trim()), rules) &&
    fieldOk("trades", (partner.catalog_service_ids?.length ?? 0) > 0, rules)
  );
}

export function isPartnerFunnelComplete(params: {
  partner: PartnerFunnelRow;
  docs: PartnerDocLike[];
  requiredDocs: RequiredDocDef[];
  signedContractTypes: string[];
  registrationRules?: PartnerRegistrationRuleRow[] | null;
  documentRules?: PartnerDocRuleRow[] | null;
}): boolean {
  const registrationRules = params.registrationRules ?? mergePartnerRegistrationRules(null);
  if (!isPartnerProfileFunnelComplete(params.partner, registrationRules)) return false;

  if (isPartnerRegistrationFieldVisible("documents", registrationRules)) {
    const mandatoryDocs = params.documentRules
      ? filterMandatoryRequiredDocs(params.requiredDocs, params.documentRules)
      : params.requiredDocs;
    if (
      isPartnerRegistrationFieldMandatory("documents", registrationRules) &&
      missingFromChecklist(params.docs, mandatoryDocs).length > 0
    ) {
      return false;
    }
  }

  if (
    isPartnerRegistrationFieldVisible("agreements", registrationRules) &&
    isPartnerRegistrationFieldMandatory("agreements", registrationRules)
  ) {
    for (const t of COMPLIANCE_CONTRACT_TYPES) {
      if (!params.signedContractTypes.includes(t)) return false;
    }
  }

  return true;
}
