// GET /api/public/trades — active service_catalog rows in the Trades category (no auth).

import { NextResponse } from "next/server";
import { serviceCategory } from "@/lib/service-category";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    .filter((r) => serviceCategory(r.name) === "Trades");

  return NextResponse.json({ trades });
}
