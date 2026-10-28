import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner-auth";
import {
  extractPostcode,
  normalizeImageUrls,
  partnerCanAccessQuote,
} from "@/lib/partner-quote-access";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Prazo do lance igual ao convite do OS (PARTNER_QUOTE_BID_INVITE_EXPIRY_HOURS), 48h desde 28/10/2026.
const BID_WINDOW_HOURS = 48;
const LONDON = "Europe/London";

function fmtDeadline(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: LONDON,
  });
}

/** GET /api/quotes/[quoteId] — full quote detail for the partner drawer (OS fields + photos). */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const session = await getPartnerSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { quoteId } = await ctx.params;
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });

  const svc = createServiceClient();
  const allowed = await partnerCanAccessQuote(svc, session.partnerId, quoteId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: quote, error: qErr } = await svc
    .from("quotes")
    .select(
      "id, reference, title, scope, property_address, client_name, service_type, status, expires_at, request_id, images, catalog_service_id, catalog_service:service_catalog!quotes_catalog_service_id_fkey(name)",
    )
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const { data: inv } = await svc
    .from("quote_partner_invitations")
    .select("last_invited_at, invited_at")
    .eq("quote_id", quoteId)
    .eq("partner_id", session.partnerId)
    .maybeSingle();

  let requestDescription = "";
  let requestImages: string[] = [];
  const requestId = (quote as { request_id: string | null }).request_id;
  if (requestId) {
    const { data: sr } = await svc
      .from("service_requests")
      .select("description, images")
      .eq("id", requestId)
      .maybeSingle();
    requestDescription = typeof sr?.description === "string" ? sr.description.trim() : "";
    requestImages = normalizeImageUrls(sr?.images);
  }

  const quoteImages = normalizeImageUrls((quote as { images: unknown }).images);
  const images = [...new Set([...quoteImages, ...requestImages])];

  const scope =
    (typeof quote.scope === "string" ? quote.scope.trim() : "") || requestDescription;
  const catEmbed = quote.catalog_service as { name: string | null } | { name: string | null }[] | null;
  const catalogName = (Array.isArray(catEmbed) ? catEmbed[0]?.name : catEmbed?.name)?.trim() ?? "";
  const serviceType =
    (typeof quote.service_type === "string" ? quote.service_type.trim() : "") || catalogName;

  const invitedIso =
    (inv as { last_invited_at?: string; invited_at?: string } | null)?.last_invited_at ??
    (inv as { invited_at?: string } | null)?.invited_at ??
    null;
  let bidDeadlineAt: string | null = null;
  if (invitedIso) {
    bidDeadlineAt = new Date(
      new Date(invitedIso).getTime() + BID_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();
  } else if (quote.expires_at) {
    bidDeadlineAt = quote.expires_at;
  }

  const { data: myBid } = await svc
    .from("quote_bids")
    .select("bid_amount, status, notes")
    .eq("quote_id", quoteId)
    .eq("partner_id", session.partnerId)
    .maybeSingle();

  return NextResponse.json({
    id: quote.id,
    reference: quote.reference ?? undefined,
    title: quote.title?.trim() || "Quote request",
    scope,
    propertyAddress: quote.property_address?.trim() || "",
    postcode: extractPostcode(quote.property_address),
    clientName: "Customer",
    serviceType,
    images,
    quoteStatus: quote.status ?? "",
    deadline: fmtDeadline(bidDeadlineAt),
    bidDeadlineAt,
    bidWindowHours: BID_WINDOW_HOURS,
    myBid: myBid
      ? {
          amount: myBid.bid_amount ?? undefined,
          status: myBid.status ?? undefined,
          notes: myBid.notes ?? undefined,
        }
      : null,
  });
}
