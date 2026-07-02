// Ported from master-os/src/lib/partner-required-docs.ts — keep doc_type values aligned.

export type PartnerDocRuleRow = {
  id: string;
  enabled: boolean;
  mandatory: boolean;
};

export type RequiredDocDef = {
  id: string;
  name: string;
  description: string;
  docType: string;
  aliases: readonly string[];
  group: "core" | "legal" | "trade_cert";
};

export interface PartnerDocLike {
  id: string;
  name: string;
  doc_type: string;
  status?: string;
  created_at: string;
}

export type PartnerLegalInput = {
  partner_legal_type?: string | null;
  crn?: string | null;
};

export function inferPartnerLegal(p: PartnerLegalInput): "limited_company" | "self_employed" {
  if (p.partner_legal_type === "limited_company") return "limited_company";
  if (p.partner_legal_type === "self_employed") return "self_employed";
  return p.crn?.trim() ? "limited_company" : "self_employed";
}

export const REQUIRED_PARTNER_DOCS: RequiredDocDef[] = [
  {
    id: "photo_id",
    name: "Photo ID",
    description: "Passport or driving licence",
    docType: "id_proof",
    aliases: ["photo id", "passport", "driver license", "driving license", "id proof"],
    group: "core",
  },
  {
    id: "proof_of_address",
    name: "Proof of Address",
    description: "Utility bill or bank statement (last 3 months)",
    docType: "proof_of_address",
    aliases: ["proof of address", "utility bill", "bank statement", "address proof"],
    group: "core",
  },
  {
    id: "right_to_work",
    name: "Right to Work",
    description: "Share code, birth certificate, or passport",
    docType: "right_to_work",
    aliases: ["right to work", "share code", "birth certificate", "british passport", "passport"],
    group: "core",
  },
  {
    id: "public_liability",
    name: "Public Liability Insurance",
    description: "Active public liability policy",
    docType: "insurance",
    aliases: ["public liability", "insurance", "liability insurance"],
    group: "core",
  },
];

export const UTR_REQUIRED_DOC: RequiredDocDef = {
  id: "utr_hmrc",
  name: "UTR (HMRC)",
  description: "Proof of your Unique Taxpayer Reference (HMRC letter or screenshot)",
  docType: "utr",
  aliases: ["utr", "hmrc", "unique taxpayer", "utr (hmrc)", "tax reference"],
  group: "legal",
};

export const COMPANY_REGISTRATION_REQUIRED_DOC: RequiredDocDef = {
  id: "company_registration",
  name: "Proof of company",
  description: "Certificate of Incorporation or Companies House record",
  docType: "company_registration",
  aliases: ["proof of company", "incorporation", "companies house", "company registration"],
  group: "legal",
};

const CERTS_BY_KEYWORD: { keywords: string[]; certs: string[] }[] = [
  { keywords: ["electr", "eicr", "niceic", "rewire", "consumer unit", "fuse board"], certs: ["NICEIC / NAPIT registration", "18th Edition Wiring Regulations"] },
  { keywords: ["gas", "boiler", "central heating"], certs: ["Gas Safe registration"] },
  { keywords: ["plumb"], certs: ["Water Regulations (WRAS)"] },
  { keywords: ["pat", "appliance test"], certs: ["PAT Testing Certificate"] },
  { keywords: ["fire alarm"], certs: ["Fire Alarm Certification"] },
  { keywords: ["emergency lighting"], certs: ["Emergency Lighting Certification"] },
  { keywords: ["extinguisher"], certs: ["BAFE / extinguisher servicing certificate"] },
];

function tradeCertRequirementId(certName: string): string {
  const key = certName.trim().toLowerCase();
  return `trade-cert-${key.replace(/[^a-z0-9]+/g, "-")}`;
}

export const ALLOWED_PARTNER_DOC_TYPES = new Set([
  "insurance",
  "certification",
  "license",
  "contract",
  "tax",
  "id_proof",
  "other",
  "utr",
  "service_agreement",
  "self_bill_agreement",
  "proof_of_address",
  "right_to_work",
  "poa",
  "dbs",
  "company_registration",
]);

const DOC_TYPES_NO_EXPIRY = new Set([
  "utr",
  "company_registration",
  "service_agreement",
  "self_bill_agreement",
  "proof_of_address",
  "right_to_work",
  "dbs",
]);

export function resolvePartnerDocExpiresAt(docType: string, expiresAt?: string): string | null {
  if (DOC_TYPES_NO_EXPIRY.has(docType)) return null;
  if (expiresAt?.trim()) return new Date(expiresAt.trim()).toISOString();
  return null;
}

export function mergePartnerDocumentRules(stored: unknown): PartnerDocRuleRow[] {
  const defaults = [
    ...REQUIRED_PARTNER_DOCS,
    UTR_REQUIRED_DOC,
    COMPANY_REGISTRATION_REQUIRED_DOC,
  ].map((d) => ({ id: d.id, enabled: true, mandatory: true }));
  if (!Array.isArray(stored)) return defaults;
  const storedById = new Map<string, PartnerDocRuleRow>();
  for (const row of stored) {
    if (row == null || typeof row !== "object") continue;
    const o = row as { id?: unknown; enabled?: unknown; mandatory?: unknown };
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    const enabled = Boolean(o.enabled);
    storedById.set(o.id.trim(), {
      id: o.id.trim(),
      enabled,
      mandatory: enabled && Boolean(o.mandatory),
    });
  }
  return defaults.map((d) => storedById.get(d.id) ?? d);
}

function resolvePartnerDocRule(id: string, rules: PartnerDocRuleRow[]): { enabled: boolean; mandatory: boolean } {
  const row = rules.find((r) => r.id === id);
  return row ? { enabled: row.enabled, mandatory: row.mandatory && row.enabled } : { enabled: true, mandatory: true };
}

export function filterMandatoryRequiredDocs(defs: RequiredDocDef[], rules: PartnerDocRuleRow[]): RequiredDocDef[] {
  return defs.filter((d) => resolvePartnerDocRule(d.id, rules).mandatory);
}

function filterDefsByRules(defs: RequiredDocDef[], rules: PartnerDocRuleRow[]): RequiredDocDef[] {
  return defs.filter((d) => resolvePartnerDocRule(d.id, rules).enabled);
}

function buildTradeCertificateRequirements(trades: string[], rules: PartnerDocRuleRow[]): RequiredDocDef[] {
  const out: RequiredDocDef[] = [];
  const seen = new Set<string>();
  const tradeLower = trades.map((t) => t.toLowerCase());
  for (const { keywords, certs } of CERTS_BY_KEYWORD) {
    if (!tradeLower.some((t) => keywords.some((k) => t.includes(k)))) continue;
    for (const cert of certs) {
      const key = cert.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: tradeCertRequirementId(cert),
        name: cert,
        description: "Trade certificate required for your services",
        docType: "certification",
        aliases: [key, "certificate"],
        group: "trade_cert",
      });
    }
  }
  return filterDefsByRules(out, rules);
}

export function buildPortalRequiredDocumentChecklist(
  partner: PartnerLegalInput | null,
  trades: string[],
  rules?: PartnerDocRuleRow[] | null,
): RequiredDocDef[] {
  const mergedRules = rules ?? mergePartnerDocumentRules(null);
  const tradeCerts = buildTradeCertificateRequirements(trades, mergedRules);
  const legal =
    partner && inferPartnerLegal(partner) === "self_employed"
      ? UTR_REQUIRED_DOC
      : partner && inferPartnerLegal(partner) === "limited_company"
        ? COMPANY_REGISTRATION_REQUIRED_DOC
        : null;
  const base = legal ? [...REQUIRED_PARTNER_DOCS, legal, ...tradeCerts] : [...REQUIRED_PARTNER_DOCS, ...tradeCerts];
  return filterDefsByRules(base, mergedRules);
}

export function pickRequiredDocMatch(
  docs: PartnerDocLike[],
  req: Pick<RequiredDocDef, "docType" | "name" | "aliases">,
): PartnerDocLike | null {
  const eligible = docs.filter((d) => {
    const status = (d.status ?? "pending").toLowerCase();
    return status !== "rejected" && status !== "expired";
  });
  const aliasMatch = eligible.filter((d) => {
    const n = String(d.name ?? "").toLowerCase();
    return req.aliases.some((a) => n.includes(a));
  });
  const byType = eligible.filter((d) => d.doc_type === req.docType);
  const byId = new Map<string, PartnerDocLike>();
  for (const doc of [...aliasMatch, ...byType]) byId.set(doc.id, doc);
  const sorted = [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return sorted[0] ?? null;
}

const DOC_SATISFIES = new Set(["verified", "pending", "approved"]);

export function missingFromChecklist(
  docs: PartnerDocLike[],
  checklist: RequiredDocDef[],
): RequiredDocDef[] {
  return checklist.filter((req) => {
    const match = pickRequiredDocMatch(docs, req);
    if (!match) return true;
    const status = (match.status ?? "pending").toLowerCase();
    return !DOC_SATISFIES.has(status);
  });
}
