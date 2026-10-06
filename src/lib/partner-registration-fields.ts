/** Partner registration field rules — stored in company_settings.frontend_setup.partner_registration_rules. */

export type PartnerRegistrationRuleRow = {
  id: string;
  visible: boolean;
  mandatory: boolean;
};

export type PartnerRegistrationFieldGroup = "profile" | "onboarding_step" | "agreement";

export type PartnerRegistrationFieldDef = {
  id: string;
  name: string;
  description: string;
  group: PartnerRegistrationFieldGroup;
  /** Cannot be hidden (account creation). */
  locked?: boolean;
};

export const PARTNER_REGISTRATION_FIELD_CATALOG: PartnerRegistrationFieldDef[] = [
  { id: "trades", name: "Trades / services", description: "What work the partner offers (service catalog).", group: "profile" },
  { id: "legal_type", name: "Business type", description: "Sole trader vs limited company.", group: "profile" },
  { id: "tax_id", name: "UTR / CRN", description: "Tax or company registration number.", group: "profile" },
  { id: "vat", name: "VAT details", description: "VAT registered status and number (limited companies, business step). Every partner also confirms their VAT status when signing.", group: "profile" },
  { id: "phone", name: "Phone number", description: "Contact number for dispatch and ops.", group: "profile" },
  { id: "address", name: "Business address", description: "Street address and postcode.", group: "profile" },
  {
    id: "account",
    name: "Account (name, email, company)",
    description: "Required to create the Trade Portal login.",
    group: "profile",
    locked: true,
  },
  { id: "coverage", name: "Service area", description: "Base postcode and travel radius.", group: "profile" },
  { id: "avatar", name: "Profile photo", description: "Partner avatar in the portal.", group: "profile" },
  { id: "documents", name: "Documents", description: "Upload step in /get-started and onboarding.", group: "onboarding_step" },
  { id: "agreements", name: "Agreements (e-sign)", description: "Partner Agreement, Terms of Use, Invoicing and Payment Collection Agreement and the VAT status declaration.", group: "agreement" },
  { id: "rate_card", name: "Rate card", description: "Per-service pricing in onboarding.", group: "onboarding_step" },
  { id: "bank_details", name: "Bank / payouts", description: "Payout bank details or Stripe Connect.", group: "onboarding_step" },
  // "payment" (card on file for a paid plan) was retired with the plans on 6 Oct 2026.
];

const OPTIONAL_BY_DEFAULT = new Set(["rate_card", "bank_details", "avatar"]);

export function buildDefaultPartnerRegistrationRules(): PartnerRegistrationRuleRow[] {
  return PARTNER_REGISTRATION_FIELD_CATALOG.map((f) => ({
    id: f.id,
    visible: true,
    mandatory: f.locked ? true : !OPTIONAL_BY_DEFAULT.has(f.id),
  }));
}

export function mergePartnerRegistrationRules(stored: unknown): PartnerRegistrationRuleRow[] {
  const defaults = buildDefaultPartnerRegistrationRules();
  if (!Array.isArray(stored)) return defaults;
  const storedById = new Map<string, PartnerRegistrationRuleRow>();
  for (const row of stored) {
    if (row == null || typeof row !== "object") continue;
    const o = row as { id?: unknown; visible?: unknown; mandatory?: unknown; enabled?: unknown };
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    const id = o.id.trim();
    const locked = PARTNER_REGISTRATION_FIELD_CATALOG.find((c) => c.id === id)?.locked;
    const visible = locked ? true : o.visible !== undefined ? Boolean(o.visible) : o.enabled !== undefined ? Boolean(o.enabled) : true;
    storedById.set(id, {
      id,
      visible,
      mandatory: locked ? true : visible && Boolean(o.mandatory),
    });
  }
  return defaults.map((d) => {
    const merged = storedById.get(d.id) ?? d;
    if (PARTNER_REGISTRATION_FIELD_CATALOG.find((c) => c.id === d.id)?.locked) {
      return { id: d.id, visible: true, mandatory: true };
    }
    return merged;
  });
}

export function resolvePartnerRegistrationRule(
  id: string,
  rules?: PartnerRegistrationRuleRow[] | null,
): { visible: boolean; mandatory: boolean } {
  const merged = rules ?? buildDefaultPartnerRegistrationRules();
  const row = merged.find((r) => r.id === id);
  const locked = PARTNER_REGISTRATION_FIELD_CATALOG.find((c) => c.id === id)?.locked;
  if (locked) return { visible: true, mandatory: true };
  if (row) return { visible: row.visible, mandatory: row.mandatory && row.visible };
  const def = buildDefaultPartnerRegistrationRules().find((r) => r.id === id);
  if (def) return { visible: def.visible, mandatory: def.mandatory && def.visible };
  return { visible: false, mandatory: false };
}

export function isPartnerRegistrationFieldVisible(id: string, rules?: PartnerRegistrationRuleRow[] | null): boolean {
  return resolvePartnerRegistrationRule(id, rules).visible;
}

export function isPartnerRegistrationFieldMandatory(id: string, rules?: PartnerRegistrationRuleRow[] | null): boolean {
  return resolvePartnerRegistrationRule(id, rules).mandatory;
}

/** Onboarding wizard step id → registration rule id. */
export const ONBOARDING_STEP_RULE_ID: Record<string, string> = {
  trades: "trades",
  area: "coverage",
  rates: "rate_card",
  docs: "documents",
  selfbill: "bank_details",
  policies: "agreements",
};

/** Settings page id → registration rule id (pages without an entry stay visible). */
export const SETTINGS_PAGE_RULE_ID: Record<string, string> = {
  trades: "trades",
  rates: "rate_card",
  area: "coverage",
  docs: "documents",
  policies: "agreements",
  selfbill: "bank_details",
};

export type GetStartedStepId =
  | "trades"
  | "lead"
  /** Rate card: our standard pay per service, or the partner's own. Right after their details. */
  | "rates"
  | "business"
  | "coverage"
  /** Own tools + able to supply materials: both essential, asked after the service area. */
  | "equipment"
  /** Dias, horário e máx. de jobs por dia: sem isso o OS não oferece job (29/09/2026). */
  | "availability"
  | "documents"
  | "agreements"
  /** Gamified "we're getting you ready" full-screen animation shown after agreements, then straight into the portal. */
  | "getting_ready";

export const GET_STARTED_STEP_DEFS: { id: GetStartedStepId; ruleIds: string[] }[] = [
  { id: "trades", ruleIds: ["trades"] },
  // Details carry the business address too (it used to be its own step).
  { id: "lead", ruleIds: ["account", "phone", "address"] },
  { id: "rates", ruleIds: ["rate_card"] },
  { id: "business", ruleIds: ["legal_type", "tax_id", "vat"] },
  // No account step: leaving `business` creates the login without an email code.
  { id: "coverage", ruleIds: ["coverage"] },
  // Always asked, so it rides on the locked `account` rule like getting_ready.
  { id: "equipment", ruleIds: ["account"] },
  // Também preso ao `account`: todo parceiro precisa dizer quando trabalha.
  { id: "availability", ruleIds: ["account"] },
  { id: "documents", ruleIds: ["documents"] },
  { id: "agreements", ruleIds: ["agreements"] },
  // Closing animation piggybacks on the `account` rule (locked-visible) so it
  // always runs last, then redirects into the portal.
  { id: "getting_ready", ruleIds: ["account"] },
];

export function filterGetStartedSteps(rules?: PartnerRegistrationRuleRow[] | null): GetStartedStepId[] {
  return GET_STARTED_STEP_DEFS.filter(({ ruleIds }) =>
    ruleIds.some((id) => isPartnerRegistrationFieldVisible(id, rules)),
  ).map((s) => s.id);
}
