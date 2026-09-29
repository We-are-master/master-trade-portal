// POST /api/partner/onboarding-availability  { days: ["mon",...], start, end, maxJobsPerDay }
// "When can you work?" step of /get-started, right after tools & materials.
// It is what the OS uses to count daily capacity and to decide who gets an
// offer: a partner with no working days gets no jobs (29/09/2026).

import { NextResponse, type NextRequest } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { DAYS, DEFAULT_AVAILABILITY, type Availability, type DayKey } from "@/lib/queries/partner-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: NextRequest) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { days?: unknown; start?: unknown; end?: unknown; maxJobsPerDay?: unknown } | null;
  const dias = Array.isArray(body?.days) ? (body!.days as unknown[]).filter((d): d is DayKey => DAYS.some((x) => x.key === d)) : [];
  const start = typeof body?.start === "string" ? body.start : "";
  const end = typeof body?.end === "string" ? body.end : "";
  const max = Math.floor(Number(body?.maxJobsPerDay));
  if (!dias.length) return NextResponse.json({ error: "Pick at least one day you work." }, { status: 400 });
  if (!HORA.test(start) || !HORA.test(end) || start >= end) return NextResponse.json({ error: "Use HH:MM and finish after you start." }, { status: 400 });
  if (!(max >= 1 && max <= 20)) return NextResponse.json({ error: "Max jobs per day must be between 1 and 20." }, { status: 400 });

  const availability: Availability = {
    ...DEFAULT_AVAILABILITY,
    days: Object.fromEntries(DAYS.map(({ key }) => [key, { on: dias.includes(key), start, end }])) as Availability["days"],
    maxJobsPerDay: max,
  };
  const { error } = await createServiceClient().from("partners").update({ availability }).eq("id", session.partnerId);
  if (error) {
    console.error("[partner/onboarding-availability]", error);
    return NextResponse.json({ error: "Couldn't save your availability." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
