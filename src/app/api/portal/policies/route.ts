// GET /api/portal/policies — public policy values the "How Fixfy Trade works"
// wizard step displays. Sourced from company_settings so ops can tune them
// without a portal deploy.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_PAYOUT_TERMS = "Every 2 weeks on Friday";
const DEFAULT_PARTNER_CANCEL_FEE_GBP = 15;
const DEFAULT_SUPPORT_EMAIL = "support@getfixfy.com";
const DEFAULT_COMPANY_NAME = "Fixfy";

export interface PortalPoliciesResponse {
  companyName: string;
  supportEmail: string;
  payoutTerms: string;
  partnerCancelFeeGbp: number;
  currency: string;
}

export async function GET() {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("company_settings")
      .select("company_name, email, partner_cancellation_fee_gbp, frontend_setup")
      .limit(1)
      .maybeSingle();
    const row = (data ?? {}) as {
      company_name?: string | null;
      email?: string | null;
      partner_cancellation_fee_gbp?: number | null;
      frontend_setup?: { partner_payout_standard_terms?: string | null } | null;
    };

    const payoutTerms =
      row.frontend_setup?.partner_payout_standard_terms?.trim() || DEFAULT_PAYOUT_TERMS;
    const cancelFee = Number(row.partner_cancellation_fee_gbp ?? DEFAULT_PARTNER_CANCEL_FEE_GBP);

    const payload: PortalPoliciesResponse = {
      companyName: row.company_name?.trim() || DEFAULT_COMPANY_NAME,
      supportEmail: row.email?.trim() || DEFAULT_SUPPORT_EMAIL,
      payoutTerms,
      partnerCancelFeeGbp: Number.isFinite(cancelFee) ? cancelFee : DEFAULT_PARTNER_CANCEL_FEE_GBP,
      currency: "GBP",
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[portal/policies]", err);
    return NextResponse.json({
      companyName: DEFAULT_COMPANY_NAME,
      supportEmail: DEFAULT_SUPPORT_EMAIL,
      payoutTerms: DEFAULT_PAYOUT_TERMS,
      partnerCancelFeeGbp: DEFAULT_PARTNER_CANCEL_FEE_GBP,
      currency: "GBP",
    } satisfies PortalPoliciesResponse);
  }
}
