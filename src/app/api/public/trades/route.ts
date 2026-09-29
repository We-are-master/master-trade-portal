// GET /api/public/trades — active service_catalog rows partners can pick at
// get-started, grouped by the category the OS keeps (migration 304: General
// Maintenance, Cleaning, Certificates...). Certificates are pickable too: the
// OS offers certificate jobs to partners who have them.

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
    .select("id, name, service_categories(name, sort)")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[public/trades]", error);
    return NextResponse.json({ error: "Couldn't load trades." }, { status: 500 });
  }

  // The category rides along so the picker can group Trades and Cleaning into
  // separate sections instead of one mixed alphabetical list.
  type Linha = { id: string; name: string | null; service_categories: { name: string; sort: number } | null };
  const trades = ((data ?? []) as unknown as Linha[])
    .map((r) => {
      const name = (r.name || "Service").trim();
      // Categoria do OS; sem ela (linha antiga), a adivinhação pelo nome.
      const category = r.service_categories?.name ?? (serviceCategory(name) === "Trades" ? "General Maintenance" : serviceCategory(name));
      return { id: r.id, name, category, categorySort: r.service_categories?.sort ?? 99 };
    })
    .sort((a, b) => a.categorySort - b.categorySort || a.name.localeCompare(b.name));

  return NextResponse.json({ trades });
}
