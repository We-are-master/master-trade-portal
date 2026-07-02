// Server-side partner identity. The portal user IS the partner: a Fixfy OS app user
// (public.users, user_type='external_partner') signed in via Supabase auth. Operational data
// (jobs, quotes, self-bills…) keys off public.partners.id, linked to the auth user by
// partners.auth_user_id. We resolve that link, and if the partners row doesn't exist yet we
// create/link it via the same RPC the mobile app uses (ensure_partner_from_app_registration).

import { createClient } from "@/lib/supabase/server";
import { mapPartner, type PartnerRow } from "@/lib/map-partner";
import type { Partner } from "@/types";

// Only columns guaranteed to exist on every environment. Columns added by
// recent migrations (wizard_completed_at, account_type, billing…) are pulled
// in the best-effort `extra` select below — putting them here breaks sign-in
// on databases where the migration hasn't been applied yet.
const BASE_COLS = "id, company_name, contact_name, email, phone, trade, trades, rating, jobs_completed, location, partner_address, avatar_url, status";

export interface PartnerSession {
  userId: string;
  email: string | null;
  partnerId: string;
  partner: Partner;
}

export async function getPartnerSession(): Promise<PartnerSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 1) Already-linked partner row?
  let { data } = await supabase.from("partners").select(BASE_COLS).eq("auth_user_id", user.id).maybeSingle();

  // 2) Not linked yet → ensure it via the OS RPC. Creates/links a partners row for an
  //    external_partner app user (idempotent, SECURITY DEFINER). Raises if the caller isn't a
  //    registered partner (no public.users row / wrong user_type) → treated as "no access".
  if (!data) {
    const { data: ensuredId, error: rpcErr } = await supabase.rpc("ensure_partner_from_app_registration");
    if (!rpcErr && ensuredId) {
      const r = await supabase.from("partners").select(BASE_COLS).eq("id", ensuredId as string).maybeSingle();
      data = r.data;
    }
  }

  if (!data) return null;

  // Best-effort: pull the columns added by later migrations (196/204). If those migrations
  // haven't been applied yet the select errors on the missing columns — we ignore it and fall
  // back to the base row, so sign-in never breaks.
  let extra: Partial<PartnerRow> = {};
  const { data: ext } = await supabase
    .from("partners")
    .select("trial_ends_at, subscription_status, plan, billing_ready, bio, years_experience, service_radius_miles, excluded_postcodes")
    .eq("id", data.id)
    .maybeSingle();
  if (ext) extra = ext as Partial<PartnerRow>;

  // Best-effort #2 (migration 247): wizard completion + account tier. Kept in
  // its own select so a database without 247 still resolves the session AND
  // keeps the billing columns above.
  const { data: ext2 } = await supabase
    .from("partners")
    .select("wizard_completed_at, account_type")
    .eq("id", data.id)
    .maybeSingle();
  if (ext2) extra = { ...extra, ...(ext2 as Partial<PartnerRow>) };

  return {
    userId: user.id,
    email: user.email ?? null,
    partnerId: data.id,
    partner: mapPartner({ ...(data as PartnerRow), ...extra }),
  };
}
