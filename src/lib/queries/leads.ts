// Reads the partner's distributed leads (service_request_partner_offers → service_requests)
// and lets them mark a lead contacted/declined. The OS distributes leads by inserting offer
// rows (migration 199); the portal only reads its own + updates status.
//
// service_requests is thin (no trade or customer-name a partner may read), so a lead surfaces
// title/description/postcode/budget/timing only — no fabricated trade badge or customer identity.

import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadOfferStatus = "offered" | "viewed" | "contacted" | "declined" | "expired" | "closed";

interface OfferRow {
  id: string;
  status: LeadOfferStatus;
  offered_at: string | null;
  contacted_at: string | null;
  service_requests: {
    id: string;
    service_type: string | null;
    description: string | null;
    postcode: string | null;
    location: string | null;
    budget: number | null;
    priority: string | null;
    request_kind: string | null;
    created_at: string | null;
  } | null;
}

export interface RealLead {
  offerId: string;
  status: LeadOfferStatus;
  title: string;
  desc: string;
  postcode: string;
  budget: number | null;
  timing: string;
  posted: string;
  emergency: boolean;
}

const LONDON = "Europe/London";
function extractPostcode(loc: string | null): string {
  if (!loc) return "";
  const m = loc.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return m ? m[1].toUpperCase() : "";
}
function relative(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: LONDON });
}
function prettyTiming(priority: string | null, kind: string | null): string {
  if (priority && /urgent|emergency|high/i.test(priority)) return "Urgent";
  if (kind === "work") return "Ready to book";
  if (kind === "quote") return "Wants a quote";
  return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : "Flexible";
}

function mapOffer(row: OfferRow): RealLead | null {
  const sr = row.service_requests;
  if (!sr) return null;
  const priority = sr.priority ?? "";
  return {
    offerId: row.id,
    status: row.status,
    title: sr.service_type || "Customer enquiry",
    desc: sr.description || "",
    postcode: sr.postcode || extractPostcode(sr.location),
    budget: sr.budget,
    timing: prettyTiming(priority, sr.request_kind),
    posted: relative(row.offered_at || sr.created_at),
    emergency: /urgent|emergency|high/i.test(priority),
  };
}

export async function fetchLeads(supabase: SupabaseClient, partnerId: string): Promise<RealLead[]> {
  const { data, error } = await supabase
    .from("service_request_partner_offers")
    .select(
      "id,status,offered_at,contacted_at,service_requests(id,service_type,description,postcode,location,budget,priority,request_kind,created_at)",
    )
    .eq("partner_id", partnerId)
    .in("status", ["offered", "viewed", "contacted"])
    .order("offered_at", { ascending: false });
  // Surface the real cause (e.g. "relation service_request_partner_offers does not exist" =
  // migration 199 not applied). Supabase errors aren't Error instances, so wrap the message.
  if (error) throw new Error(error.message || "Failed to load leads");
  return (data as unknown as OfferRow[]).map(mapOffer).filter((l): l is RealLead => l !== null);
}

export async function setLeadStatus(supabase: SupabaseClient, offerId: string, status: LeadOfferStatus): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "contacted") patch.contacted_at = new Date().toISOString();
  const { error } = await supabase.from("service_request_partner_offers").update(patch).eq("id", offerId);
  if (error) throw error;
}
