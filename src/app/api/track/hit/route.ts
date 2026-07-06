// POST /api/track/hit  { path, sessionId?, referrer? }
// First-party page-hit tracking for the Master OS partner funnel (get-started visits).
// Writes one row per visit via the service role. Must never error the page.

import { NextResponse, type NextRequest } from "next/server";
import { tryCreateServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { path?: unknown; sessionId?: unknown; referrer?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const path = typeof body.path === "string" ? body.path.trim().slice(0, 200) : "";
  if (!path) return NextResponse.json({ ok: false }, { status: 400 });
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 300) : null;

  const svc = tryCreateServiceClient();
  if (!svc) return NextResponse.json({ ok: true }); // tracking not configured — no-op, never fail

  try {
    await svc.from("page_hits").insert({ path, session_id: sessionId, referrer });
  } catch {
    /* swallow — tracking must never break the funnel */
  }
  return NextResponse.json({ ok: true });
}
