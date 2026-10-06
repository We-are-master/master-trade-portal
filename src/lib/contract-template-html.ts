import { readFileSync } from "fs";
import { join } from "path";
import { hydrateContractHtml } from "./contract-branding";
import {
  PARTNER_CONTRACT_TITLES,
  PARTNER_CONTRACT_TYPES,
  type PartnerContractType,
} from "./partner-contract-types";

export { PARTNER_CONTRACT_TYPES, PARTNER_CONTRACT_TITLES, type PartnerContractType };

// FALLBACK ONLY. The agreements partners actually see and sign are the active
// rows of contract_versions (body_html) in the shared database, published from
// master-os. These local files mirror the 2026-10-06 documents (agent model):
//   - contractor_service_agreement → Partner Agreement (with the Commission
//     Schedule appended as its annex)
//   - terms_of_use                 → Partner Terms of Use
//   - self_bill_agreement          → Invoicing and Payment Collection Agreement
// and are read only by the seed / migration scripts in scripts/.
export const PARTNER_CONTRACT_TEMPLATE_VERSION = "2026-10-06";

const TEMPLATE_FILES: Record<PartnerContractType, string> = {
  terms_of_use: "fixfy-terms-of-use.html",
  self_bill_agreement: "fixfy-self-billing-agreement.html",
  contractor_service_agreement: "fixfy-contractor-service-agreement.html",
};

const TEMPLATE_DIR = join(process.cwd(), "src/lib/contract-templates");

/** Full HTML document for PDF / archival (style + page body). Server/script use only. */
export function loadPartnerContractBodyHtml(type: PartnerContractType): string {
  const raw = readFileSync(join(TEMPLATE_DIR, TEMPLATE_FILES[type]), "utf8");
  const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const pageMatch = raw.match(/<div class="page">([\s\S]*?)<\/div>\s*<\/body>/i);
  const style = styleMatch?.[1]?.trim() ?? "";
  const page = pageMatch?.[1]?.trim() ?? raw;
  const body = !style ? page : `<style>${style}</style>\n<div class="page">${page}</div>`;
  return hydrateContractHtml(body);
}

export function partnerContractTitle(type: PartnerContractType): string {
  return PARTNER_CONTRACT_TITLES[type];
}
