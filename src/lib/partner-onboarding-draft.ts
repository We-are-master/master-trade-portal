import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePartnerPortalShortCode,
  generatePartnerPortalTokenRaw,
  hashPartnerPortalToken,
} from "@/lib/partner-portal-crypto";
import { resolvePartnerJoinInvite } from "@/lib/partner-join-invite";
import { resolvePartnerPortalCredential } from "@/lib/partner-portal-session";

export type OnboardingDraftInput = {
  inviteCode?: string;
  draftCode?: string;
  email?: string;
  fullName?: string;
  company?: string;
  phone?: string;
  partnerAddress?: string;
  trades?: string[];
  primaryTrade?: string;
  catalogServiceIds?: string[];
  /** Business type — Step 3 of the wizard. */
  legalType?: "self_employed" | "limited_company" | null;
  /** UTR (sole trader) or CRN (limited company). */
  regNumber?: string;
  vatRegistered?: boolean | null;
  vatNumber?: string;
  /** Coverage — Step 6. */
  coveragePostcode?: string;
  coverageRadius?: number;
};

export type OnboardingDraftResult = {
  partnerId: string;
  draftCode: string;
  created: boolean;
};

const DRAFT_TOKEN_DAYS = 90;

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function derivePartnerNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "partner").trim();
  if (!local) return "Partner";
  const label = local
    .replace(/[._+-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return (label || "Partner").slice(0, 120);
}

async function insertPortalToken(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + DRAFT_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tokenHash = hashPartnerPortalToken(generatePartnerPortalTokenRaw());
  let lastError: { message?: string; code?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generatePartnerPortalShortCode();
    const { error } = await supabase.from("partner_portal_tokens").insert({
      partner_id: partnerId,
      token_hash: tokenHash,
      short_code: shortCode,
      expires_at: expiresAt,
      requested_doc_ids: null,
    });
    if (!error) return shortCode;
    lastError = error;
    if (error.code !== "23505") break;
  }

  throw new Error(lastError?.message ?? "Couldn't create onboarding draft token.");
}

async function resolvePartnerId(
  supabase: SupabaseClient,
  input: OnboardingDraftInput,
): Promise<{ partnerId: string; draftCode: string | null } | null> {
  const inviteCode = input.inviteCode?.trim() ?? "";
  const draftCode = input.draftCode?.trim() ?? "";
  const email = normalizeEmail(input.email);

  if (inviteCode) {
    const invite = await resolvePartnerJoinInvite(supabase, inviteCode);
    if (!invite) return null;
    if (invite.authUserId) return null;
    return { partnerId: invite.partnerId, draftCode: inviteCode };
  }

  if (draftCode) {
    const session = await resolvePartnerPortalCredential(draftCode);
    if (!session) return null;
    return { partnerId: session.partnerId, draftCode };
  }

  if (email && email.includes("@")) {
    const { data } = await supabase
      .from("partners")
      .select("id, auth_user_id, status")
      .ilike("email", email)
      .limit(1);
    const row = data?.[0] as { id?: string; auth_user_id?: string | null; status?: string | null } | undefined;
    if (row?.id && !row.auth_user_id?.trim() && (row.status === "onboarding" || !row.status)) {
      return { partnerId: row.id, draftCode: null };
    }
  }

  return null;
}

/** Create or update an onboarding partner row before account verification. */
export async function upsertOnboardingDraft(
  supabase: SupabaseClient,
  input: OnboardingDraftInput,
): Promise<OnboardingDraftResult> {
  const email = normalizeEmail(input.email);
  const fullName = typeof input.fullName === "string" ? input.fullName.trim().slice(0, 120) : "";
  const company = typeof input.company === "string" ? input.company.trim().slice(0, 120) : "";
  const phone = typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : "";
  const partnerAddress =
    typeof input.partnerAddress === "string" ? input.partnerAddress.trim().slice(0, 240) : "";
  const trades = Array.isArray(input.trades)
    ? input.trades.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
    : [];
  const catalogServiceIds = Array.isArray(input.catalogServiceIds)
    ? input.catalogServiceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const primaryTrade =
    typeof input.primaryTrade === "string" && input.primaryTrade.trim()
      ? input.primaryTrade.trim()
      : trades[0] ?? "";
  const legalType =
    input.legalType === "self_employed" || input.legalType === "limited_company"
      ? input.legalType
      : null;
  const regNumber =
    typeof input.regNumber === "string" ? input.regNumber.trim().slice(0, 32) : "";
  const vatNumber = typeof input.vatNumber === "string" ? input.vatNumber.trim().slice(0, 32) : "";
  const coveragePostcode =
    typeof input.coveragePostcode === "string"
      ? input.coveragePostcode.trim().toUpperCase().slice(0, 16)
      : "";
  const coverageRadiusRaw =
    typeof input.coverageRadius === "number" ? input.coverageRadius : Number(input.coverageRadius);
  const coverageRadius = Number.isFinite(coverageRadiusRaw)
    ? Math.max(1, Math.min(50, Math.round(coverageRadiusRaw)))
    : null;

  const resolved = await resolvePartnerId(supabase, input);
  let partnerId = resolved?.partnerId;
  let draftCode = resolved?.draftCode ?? input.draftCode?.trim() ?? "";
  let created = false;

  if (!partnerId) {
    if (!email || !email.includes("@")) {
      throw Object.assign(new Error("Enter a valid email to save your progress."), { status: 422 });
    }

    const displayName = fullName || company || derivePartnerNameFromEmail(email);
    const orderedTrades = primaryTrade
      ? [primaryTrade, ...trades.filter((t) => t !== primaryTrade)]
      : trades;

    const { data: createdRow, error: insertErr } = await supabase
      .from("partners")
      .insert({
        email,
        contact_name: fullName || displayName,
        company_name: company || fullName || displayName,
        phone: phone || null,
        trade: primaryTrade || "",
        trades: orderedTrades,
        catalog_service_ids: catalogServiceIds,
        status: "onboarding",
        verified: false,
        partner_legal_type: "self_employed",
        location: "",
      })
      .select("id")
      .single();

    if (insertErr) {
      const code = (insertErr as { code?: string }).code ?? "";
      if (code === "23505") {
        const retry = await resolvePartnerId(supabase, { email });
        if (!retry?.partnerId) throw insertErr;
        partnerId = retry.partnerId;
      } else {
        throw insertErr;
      }
    } else {
      partnerId = (createdRow as { id: string }).id;
      created = true;
    }
  }

  if (!partnerId) {
    throw Object.assign(new Error("Couldn't save onboarding draft."), { status: 500 });
  }

  const update: Record<string, unknown> = { status: "onboarding" };
  if (email) update.email = email;
  if (fullName) update.contact_name = fullName;
  if (company || fullName) update.company_name = company || fullName;
  if (phone || input.phone !== undefined) update.phone = phone || null;
  if (partnerAddress || input.partnerAddress !== undefined) update.partner_address = partnerAddress || null;
  if (trades.length) {
    const orderedTrades = primaryTrade
      ? [primaryTrade, ...trades.filter((t) => t !== primaryTrade)]
      : trades;
    update.trades = orderedTrades;
    update.trade = primaryTrade;
    update.catalog_service_ids = catalogServiceIds;
  }
  if (legalType || input.legalType !== undefined) {
    update.partner_legal_type = legalType;
    // UTR belongs to sole traders, CRN to limited companies. Keep the row
    // clean by only writing the side that matches; blank the other side.
    if (legalType === "self_employed") {
      update.utr = regNumber || null;
      update.crn = null;
    } else if (legalType === "limited_company") {
      update.crn = regNumber || null;
      update.utr = null;
    }
  } else if (regNumber && input.legalType === undefined) {
    // Draft came in with a reg number but no legal type context — leave the
    // decision to the next save so we don't clobber a stored value.
  }
  if (input.vatRegistered !== undefined) {
    update.vat_registered = input.vatRegistered ?? null;
    update.vat_number = input.vatRegistered ? vatNumber || null : null;
  }
  if (coveragePostcode || coverageRadius != null) {
    if (coveragePostcode) {
      update.coverage_base_postcode = coveragePostcode;
      update.location = coveragePostcode;
    }
    if (coverageRadius != null) update.service_radius_miles = coverageRadius;
    update.coverage_mode = "radius";
  }

  const { error: updateErr } = await supabase.from("partners").update(update).eq("id", partnerId);
  if (updateErr) throw updateErr;

  if (!draftCode) {
    draftCode = await insertPortalToken(supabase, partnerId);
  }

  return { partnerId, draftCode, created };
}

export interface LoadedOnboardingDraft {
  email: string;
  fullName: string;
  company: string;
  phone: string;
  partnerAddress: string;
  trades: string[];
  catalogServiceIds: string[];
  legalType: "self_employed" | "limited_company" | null;
  regNumber: string;
  vatRegistered: boolean | null;
  vatNumber: string;
  coveragePostcode: string;
  coverageRadius: number | null;
}

export async function loadOnboardingDraft(
  supabase: SupabaseClient,
  code: string,
): Promise<LoadedOnboardingDraft | null> {
  const resolved = await resolvePartnerId(supabase, { draftCode: code, inviteCode: code });
  if (!resolved) return null;

  const { data: partner, error } = await supabase
    .from("partners")
    .select(
      "email, contact_name, company_name, phone, partner_address, trades, trade, catalog_service_ids, partner_legal_type, utr, crn, vat_registered, vat_number, coverage_base_postcode, service_radius_miles",
    )
    .eq("id", resolved.partnerId)
    .maybeSingle();

  if (error || !partner) return null;
  const p = partner as {
    email?: string | null;
    contact_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    partner_address?: string | null;
    trades?: string[] | null;
    trade?: string | null;
    catalog_service_ids?: string[] | null;
    partner_legal_type?: string | null;
    utr?: string | null;
    crn?: string | null;
    vat_registered?: boolean | null;
    vat_number?: string | null;
    coverage_base_postcode?: string | null;
    service_radius_miles?: number | null;
  };

  const trades =
    p.trades?.length && p.trades.some((t) => t?.trim())
      ? p.trades.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : p.trade?.trim()
        ? [p.trade.trim()]
        : [];

  const legalType =
    p.partner_legal_type === "self_employed" || p.partner_legal_type === "limited_company"
      ? (p.partner_legal_type as "self_employed" | "limited_company")
      : null;
  const regNumber =
    (legalType === "self_employed" ? p.utr?.trim() : p.crn?.trim()) ??
    p.utr?.trim() ??
    p.crn?.trim() ??
    "";
  const rawRadius = Number(p.service_radius_miles ?? 0);

  return {
    email: p.email?.trim() ?? "",
    fullName: p.contact_name?.trim() ?? "",
    company: p.company_name?.trim() ?? "",
    phone: p.phone?.trim() ?? "",
    partnerAddress: p.partner_address?.trim() ?? "",
    trades,
    catalogServiceIds: Array.isArray(p.catalog_service_ids)
      ? p.catalog_service_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    legalType,
    regNumber,
    vatRegistered: p.vat_registered ?? null,
    vatNumber: p.vat_number?.trim() ?? "",
    coveragePostcode: p.coverage_base_postcode?.trim().toUpperCase() ?? "",
    coverageRadius: rawRadius >= 1 && rawRadius <= 50 ? Math.round(rawRadius) : null,
  };
}
