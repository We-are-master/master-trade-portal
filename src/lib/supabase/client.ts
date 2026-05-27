// Browser Supabase client (RLS-scoped to the signed-in partner).
//
// This portal reuses the SAME Supabase project/structure as Fixfy OS (master-os).
// Screens load real data through this client via the query modules in src/lib/queries/*.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }

  return createBrowserClient(url, anonKey);
}
