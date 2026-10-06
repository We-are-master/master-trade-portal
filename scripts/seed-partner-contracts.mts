/**
 * Seed Fixfy partner contract HTML via Supabase service role (no raw SQL).
 * For contractor_service_agreement, migration 229 CHECK update may still be required.
 *
 * CAUTION: this DEACTIVATES the live versions and activates the local templates
 * for every partner. New versions normally ship as master-os migrations (kept
 * inactive until the owner switches them on); only run this on a dev database.
 *
 * Usage: npx tsx scripts/seed-partner-contracts.mts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  loadPartnerContractBodyHtml,
  partnerContractTitle,
  PARTNER_CONTRACT_TEMPLATE_VERSION,
  PARTNER_CONTRACT_TYPES,
  type PartnerContractType,
} from "../src/lib/contract-template-html.ts";

const VERSION = PARTNER_CONTRACT_TEMPLATE_VERSION;

function loadEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SERVICE_ROLE_KEY required.");
    process.exit(1);
  }

  const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  for (const type of PARTNER_CONTRACT_TYPES) {
    const title = partnerContractTitle(type);
    const body_html = loadPartnerContractBodyHtml(type);

    const { error: deactivateErr } = await svc
      .from("contract_versions")
      .update({ is_active: false })
      .eq("contract_type", type)
      .eq("is_active", true);
    if (deactivateErr) {
      console.error(`[${type}] deactivate:`, deactivateErr.message);
      process.exit(1);
    }

    const { error: insertErr } = await svc.from("contract_versions").insert({
      contract_type: type,
      version: VERSION,
      title,
      body_html,
      is_active: true,
    });
    if (insertErr) {
      console.error(`[${type}] insert:`, insertErr.message);
      if (type === "contractor_service_agreement") {
        console.error(
          "Hint: run migration 229 (needs DATABASE_URL): npm run apply:partner-contracts",
        );
      }
      process.exit(1);
    }
    console.log(`Seeded ${type} v${VERSION}`);
  }

  console.log("Done. Run: npx tsx scripts/validate-partner-contracts.mts");
}

main();
