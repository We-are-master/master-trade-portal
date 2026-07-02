// Maps a real Fixfy OS `partners` row to the portal's `Partner` UI type.
//
// The DB shape (company_name, contact_name, single `trade`, location…) differs from the
// design's richer partner model, so some fields are derived and a few are placeholders
// until the schema gains them (trial/subscription land with the Stripe phase; bio,
// postcode, radius, years-experience aren't columns yet).

import { displayPartnerRating } from "@/lib/partner-rating";
import type { Partner, Trade } from "@/types";

export interface PartnerRow {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  trade: string | null;
  trades: string[] | null;
  rating: number | null;
  jobs_completed: number | null;
  location: string | null;
  partner_address: string | null;
  avatar_url?: string | null;
  // present once their migrations land (read best-effort by partner-auth):
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  plan?: string | null;
  billing_ready?: boolean | null;
  status?: string | null;
  bio?: string | null;
  years_experience?: number | null;
  service_radius_miles?: number | null;
  excluded_postcodes?: string[] | null;
  wizard_completed_at?: string | null;
  account_type?: string | null;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysUntil(iso?: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function mapPartner(row: PartnerRow): Partner {
  const contact = row.contact_name?.trim() || row.company_name?.trim() || "Partner";
  const [firstName, ...rest] = contact.split(/\s+/);
  const primary = (row.trade?.trim() || "") as Trade;
  const enabled = (row.trades && row.trades.length ? row.trades : primary ? [primary] : []) as Trade[];

  return {
    id: row.id,
    firstName: firstName || contact,
    lastName: rest.join(" "),
    email: row.email || "",
    phone: row.phone || "",
    initials: initialsFrom(contact),
    avatarBg: "#020040",
    avatarUrl: row.avatar_url ?? null,
    trades: enabled,
    primaryTrade: primary,
    postcode: (row.location || row.partner_address || "").trim(),
    radiusMiles: row.service_radius_miles ?? 8,
    tradingName: row.company_name || contact,
    trialDaysLeft: daysUntil(row.trial_ends_at),
    trialEndsOn: row.trial_ends_at ? new Date(row.trial_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
    yearsExperience: row.years_experience ?? 0,
    bio: row.bio ?? "",
    excludedPostcodes: row.excluded_postcodes ?? [],
    rating: displayPartnerRating(row.rating),
    ratingsCount: row.jobs_completed ?? 0,
    status: row.status?.trim() || "onboarding",
    plan: row.plan?.trim() || "pro",
    billingReady: Boolean(row.billing_ready),
    subscriptionStatus: row.subscription_status?.trim() || null,
    wizardCompletedAt: row.wizard_completed_at ?? null,
    accountType:
      row.account_type === "subscription" || row.account_type === "free"
        ? row.account_type
        : null,
  };
}
