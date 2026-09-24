// GET  /api/partner/onboarding-rates?draftCode=|inviteCode= — rate card for the
//      services ticked in step 1 of /get-started (our standard + any own rates).
// POST /api/partner/onboarding-rates { draftCode|inviteCode, rows } — saves it
//      into partner_service_prices, the table the OS prices this partner's jobs from.
//
// Runs before the partner has a session, so it goes through the service client
// and the same draft/invite code the other funnel saves use. Standards and the
// list of services always come from the database, never from the browser: the
// client only says standard-or-own and the own numbers, and those are capped.

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePartnerId } from "@/lib/partner-onboarding-draft";
import { clampRateCard, fetchRateCard, saveRateCard, type ServicePrice } from "@/lib/queries/rate-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadForPartner(draftCode?: string, inviteCode?: string) {
  const svc = createServiceClient();
  const resolved = await resolvePartnerId(svc, { draftCode, inviteCode });
  if (!resolved) return null;
  const { data: p } = await svc
    .from("partners")
    .select("catalog_service_ids, trades")
    .eq("id", resolved.partnerId)
    .maybeSingle();
  const row = p as { catalog_service_ids?: string[] | null; trades?: string[] | null } | null;
  const rows = await fetchRateCard(svc, resolved.partnerId, row?.trades ?? [], {
    catalogIds: row?.catalog_service_ids ?? [],
  });
  return { svc, partnerId: resolved.partnerId, rows };
}

export async function GET(req: NextRequest) {
  const draftCode = req.nextUrl.searchParams.get("draftCode")?.trim() || undefined;
  const inviteCode = req.nextUrl.searchParams.get("inviteCode")?.trim() || undefined;
  if (!draftCode && !inviteCode) return NextResponse.json({ error: "Missing code." }, { status: 400 });
  try {
    const loaded = await loadForPartner(draftCode, inviteCode);
    if (!loaded) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    return NextResponse.json({ ok: true, rows: loaded.rows });
  } catch (e) {
    console.error("[partner/onboarding-rates] GET failed:", e);
    return NextResponse.json({ error: "Couldn't load your rates." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { draftCode?: unknown; inviteCode?: unknown; rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const draftCode = typeof body.draftCode === "string" ? body.draftCode.trim() || undefined : undefined;
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() || undefined : undefined;
  if (!draftCode && !inviteCode) return NextResponse.json({ error: "Missing code." }, { status: 400 });
  const sent = Array.isArray(body.rows) ? (body.rows as Partial<ServicePrice>[]) : [];

  try {
    const loaded = await loadForPartner(draftCode, inviteCode);
    if (!loaded) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const pick = (m: unknown): Record<string, number | null> => {
      if (!m || typeof m !== "object") return {};
      const out: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
        const n = typeof v === "number" ? v : v == null ? null : Number(v);
        out[k] = n != null && Number.isFinite(n) ? n : null;
      }
      return out;
    };
    const merged = loaded.rows.map((r) => {
      const s = sent.find((x) => x?.catalogServiceId === r.catalogServiceId);
      if (!s) return r;
      const useStandard = s.useStandard !== false;
      return {
        ...r,
        useStandard,
        fixedPartnerCost: typeof s.fixedPartnerCost === "number" ? s.fixedPartnerCost : null,
        hourlyPartnerRate: typeof s.hourlyPartnerRate === "number" ? s.hourlyPartnerRate : null,
        defaultHours: typeof s.defaultHours === "number" ? s.defaultHours : null,
        bandOverrides: pick(s.bandOverrides),
        addonOverrides: pick(s.addonOverrides),
      };
    });
    const clamped = clampRateCard(merged);
    await saveRateCard(loaded.svc, loaded.partnerId, clamped);
    return NextResponse.json({ ok: true, rows: clamped });
  } catch (e) {
    console.error("[partner/onboarding-rates] POST failed:", e);
    return NextResponse.json({ error: "Couldn't save your rates." }, { status: 500 });
  }
}
