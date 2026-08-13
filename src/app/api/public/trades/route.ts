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

  const trades = ((data ?? []) as { id: string; name: string | null }[])
    .map((r) => ({ id: r.id, name: (r.name || "Service").trim() }))
    .filter((r) => PARTNER_PICKABLE.has(serviceCategory(r.name) as "Trades" | "Cleaning"));

  return NextResponse.json({ trades });
}
