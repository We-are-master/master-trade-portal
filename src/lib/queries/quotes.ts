// Maps real Fixfy OS `quotes` (the partner is invited to bid on, OR that broadcast on the
// partner's trade) → the portal's QuoteRequest UI type, and submits partner bids into
// `quote_bids`.
//
// Two visibility paths surface a bidding quote in the portal:
//   1. Explicit invite — a row in `quote_partner_invitations` (the legacy path the OS
//      Requests-to-quote flow still uses).
//   2. Broadcast — a bidding-status quote whose `catalog_service_id` matches the partner's
//      `catalog_service_ids` array (or, as a fuzzy fallback, the partner's `trades` array).
//      This is the path the new New Bidding modal uses (no manual partner picker).
//
// The `quotes` table is thin (title/total_value/status). There is no postcode or per-quote
// distance in the schema, so those stay empty/0.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteRequest, QuoteRequestStatus } from "@/types";
import { tradeMatchesService } from "@/lib/trade-match";
import {
  type PartnerBidProposalPayload,
  serializeBidProposalNotes,
} from "@/lib/quote-bid-payload";

interface InvitationRow {
  quote_id: string;
}
interface QuoteRow {
  id: string;
  reference: string | null;
  title: string | null;
  status: string | null;
  total_value: number | null;
  expires_at: string | null;
  request_id: string | null;
  catalog_service_id: string | null;
  /** PostgREST embed of the linked service_catalog row (name only). */
  catalog_service: { name: string | null } | null;
}
interface BidRow {
  quote_id: string;
  partner_id: string;
  bid_amount: number | null;
  status: string | null;
  notes: string | null;
}

// Bidding-status quotes that haven't been awarded/closed yet — these are the candidates
// for the broadcast feed. Mirrors the "closed lead" list in the leads route.
const BROADCAST_OPEN_STATUSES = ["bidding", "in_survey"];

const LONDON = "Europe/London";
function fmtDeadline(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: LONDON });
}

// to-quote: invited, no bid yet, quote still open
// submitted: my bid pending
// won: my bid approved
// lost: my bid rejected, or quote closed to someone else
function deriveStatus(quoteStatus: string, myBidStatus: string | null): QuoteRequestStatus {
  if (myBidStatus === "approved") return "won";
  if (myBidStatus === "rejected") return "lost";
  if (myBidStatus === "submitted") return "submitted";
  // no bid from me
  if (["approved", "sent", "expired"].includes(quoteStatus)) return "lost";
  return "to-quote";
}

export async function fetchAvailableQuotes(supabase: SupabaseClient, partnerId: string): Promise<QuoteRequest[]> {
  // 1) Explicit invites — every row binds a quote to this partner.
  const { data: invites, error: invErr } = await supabase
    .from("quote_partner_invitations")
    .select("quote_id")
    .eq("partner_id", partnerId);
  if (invErr) throw invErr;
  const invitedIds = new Set((invites as InvitationRow[]).map((r) => r.quote_id));

  // 2) Broadcast — pull this partner's catalog_service_ids + trades so we can match
  //    bidding quotes whose catalog_service_id covers a trade we serve.
  const { data: prow } = await supabase
    .from("partners")
    .select("catalog_service_ids, trades")
    .eq("id", partnerId)
    .maybeSingle();
  const partnerCatalogIds = new Set(
    ((prow as { catalog_service_ids: string[] | null } | null)?.catalog_service_ids ?? []).filter(Boolean),
  );
  const partnerTrades = (
    ((prow as { trades: string[] | null } | null)?.trades ?? []) as string[]
  ).filter(Boolean);

  const { data: broadcastRows } = await supabase
    .from("quotes")
    .select(
      "id,reference,title,status,total_value,expires_at,request_id,catalog_service_id," +
        "catalog_service:service_catalog!quotes_catalog_service_id_fkey(name)",
    )
    .in("status", BROADCAST_OPEN_STATUSES)
    .not("catalog_service_id", "is", null)
    .is("deleted_at", null);
  const broadcastIds = new Set<string>();
  for (const q of (broadcastRows as unknown as QuoteRow[] | null) ?? []) {
    if (!q.catalog_service_id) continue;
    if (partnerCatalogIds.has(q.catalog_service_id)) {
      broadcastIds.add(q.id);
      continue;
    }
    const catName = q.catalog_service?.name?.trim() ?? "";
    if (catName && partnerTrades.some((t) => tradeMatchesService(t, catName))) {
      broadcastIds.add(q.id);
    }
  }

  const quoteIds = Array.from(new Set([...invitedIds, ...broadcastIds]));
  if (quoteIds.length === 0) return [];

  // No service_requests embed: RLS scopes service_requests to staff/portal-clients only
  // (a back-reference would create recursive RLS — see migration 198), so a partner can't
  // read the originating request. Postcode/description are therefore omitted from the card.
  const { data: quotes, error: qErr } = await supabase
    .from("quotes")
    .select(
      "id,reference,title,status,total_value,expires_at,request_id,catalog_service_id," +
        "catalog_service:service_catalog!quotes_catalog_service_id_fkey(name)",
    )
    .in("id", quoteIds)
    .is("deleted_at", null);
  if (qErr) throw qErr;

  const { data: bids, error: bErr } = await supabase
    .from("quote_bids")
    .select("quote_id,partner_id,bid_amount,status,notes")
    .in("quote_id", quoteIds);
  if (bErr) throw bErr;
  const bidRows = bids as BidRow[];

  return (quotes as unknown as QuoteRow[]).map((q) => {
    const quoteBids = bidRows.filter((b) => b.quote_id === q.id);
    const myBid = quoteBids.find((b) => b.partner_id === partnerId);
    const competing = quoteBids.filter((b) => b.partner_id !== partnerId && b.bid_amount != null).map((b) => b.bid_amount as number);
    const leadingBid = competing.length ? Math.min(...competing) : undefined;
    const status = deriveStatus(q.status ?? "", myBid?.status ?? null);

    return {
      id: q.id,
      reference: q.reference ?? undefined,
      title: q.title || "Quote request",
      desc: "", // originating service_request isn't partner-readable (RLS)
      trades: [], // no per-quote trade in the schema
      postcode: "", // see above
      distance: 0, // no geo distance available
      deadline: fmtDeadline(q.expires_at),
      status,
      yourBid: myBid?.bid_amount ?? undefined,
      myBidNotes: myBid?.notes ?? undefined,
      leadingBid,
      awardedAmount: status === "won" ? myBid?.bid_amount ?? q.total_value ?? undefined : undefined,
    } satisfies QuoteRequest;
  });
}

export async function submitBid(
  supabase: SupabaseClient,
  args: {
    quoteId: string;
    partnerId: string;
    partnerName: string;
    amount: number;
    payload: PartnerBidProposalPayload;
  },
): Promise<void> {
  const notes = serializeBidProposalNotes(args.payload);
  // Mirror the OS-side bid insert exactly (src/app/api/quotes/submit-bid/route.ts):
  // - explicit job_type 'fixed' so the column never lands NULL on schemas where
  //   the default was added after the row was created.
  // - created_at / updated_at stamped explicitly so the row carries timestamps
  //   the approval RPC + UI consumers can rely on.
  // - upsert by (quote_id, partner_id) so a partner re-submitting just refreshes
  //   their bid instead of writing a sibling row that the approve flow then has
  //   to reject.
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("quote_bids")
    .select("id")
    .eq("quote_id", args.quoteId)
    .eq("partner_id", args.partnerId)
    .maybeSingle();

  if (existing && (existing as { id: string }).id) {
    const { error } = await supabase
      .from("quote_bids")
      .update({
        bid_amount: args.amount,
        job_type:   "fixed",
        notes,
        status:     "submitted",
        updated_at: now,
      })
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("quote_bids").insert({
    quote_id:     args.quoteId,
    partner_id:   args.partnerId,
    partner_name: args.partnerName,
    bid_amount:   args.amount,
    job_type:     "fixed",
    notes,
    status:       "submitted",
    created_at:   now,
    updated_at:   now,
  });
  if (error) throw error;
}
