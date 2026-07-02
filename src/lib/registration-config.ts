import {
  mergePartnerRegistrationRules,
  type PartnerRegistrationRuleRow,
} from "@/lib/partner-registration-fields";
import { mergePartnerDocumentRules, type PartnerDocRuleRow } from "@/lib/partner-required-docs";

export type RegistrationDocumentRule = {
  id: string;
  visible: boolean;
  mandatory: boolean;
};

export type RegistrationConfig = {
  fields: PartnerRegistrationRuleRow[];
  documents: RegistrationDocumentRule[];
};

export function buildRegistrationConfig(frontendSetup: unknown): RegistrationConfig {
  const fs = frontendSetup as {
    partner_registration_rules?: unknown;
    partner_document_rules?: unknown;
  } | null;
  const fields = mergePartnerRegistrationRules(fs?.partner_registration_rules);
  const docRules = mergePartnerDocumentRules(fs?.partner_document_rules);
  return {
    fields,
    documents: docRules.map((r) => ({
      id: r.id,
      visible: r.enabled,
      mandatory: r.mandatory,
    })),
  };
}

export async function loadRegistrationConfigFromDb(
  svc: { from: (table: string) => { select: (cols: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } } } },
): Promise<RegistrationConfig> {
  try {
    const { data: cs } = await svc.from("company_settings").select("frontend_setup").limit(1).maybeSingle();
    const fs = (cs as { frontend_setup?: unknown } | null)?.frontend_setup;
    return buildRegistrationConfig(fs);
  } catch {
    return buildRegistrationConfig(null);
  }
}

export function resolveDocumentRule(id: string, rules: PartnerDocRuleRow[]): { visible: boolean; mandatory: boolean } {
  const row = rules.find((r) => r.id === id);
  if (!row) return { visible: true, mandatory: true };
  return { visible: row.enabled, mandatory: row.mandatory && row.enabled };
}
