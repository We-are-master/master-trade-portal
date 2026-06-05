// Service-role Supabase client — SERVER ONLY. Bypasses RLS.
// Use only in trusted server routes (e.g. the Stripe webhook updating partner
// subscription state). Never import this into a client component.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

function getServiceRoleKey(): string | undefined {
  return (
    process.env.SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

export function createServiceClient() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!url || !serviceKey) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
    if (!serviceKey) missing.push("SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
    throw new Error(`Service client env missing: ${missing.join(", ")}.`);
  }
  return createSupabaseClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isServiceRoleConfigured(): boolean {
  return !!(getSupabaseUrl() && getServiceRoleKey());
}
