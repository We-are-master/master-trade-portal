// GET /api/public/trades — active service_catalog rows partners can pick at
// get-started (Trades + Cleaning). Certificates stay out of this picker.

import { NextResponse } from "next/server";
import { serviceCategory } from "@/lib/service-category";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PARTNER_PICKABLE = new Set(["Trades", "Cleaning"] as const);

export async function GET() {
  const svc = tryCreateServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await svc
    .from("service_catalog")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[public/trades]", error);
    return NextResponse.json({ error: "Couldn't load trades." }, { status: 500 });
  }

  // The category rides along so the picker can group Trades and Cleaning into
  // separate sections instead of one mixed alphabetical list.
  const trades = ((data ?? []) as { id: string; name: string | null }[])
    .map((r) => {
      const name = (r.name || "Service").trim();
      return { id: r.id, name, category: serviceCategory(name) };
    })
    .filter((r) => PARTNER_PICKABLE.has(r.category as "Trades" | "Cleaning"));

  return NextResponse.json({ trades });
}
