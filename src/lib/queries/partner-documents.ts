// Maps real Fixfy OS `partner_documents` rows → the portal's document card UI type.

import type { SupabaseClient } from "@supabase/supabase-js";

export const PARTNER_DOC_SELECT = [
  "id",
  "name",
  "doc_type",
  "file_name",
  "file_url",
  "status",
  "expires_at",
  "notes",
  "preview_image_path",
  "created_at",
].join(",");

export interface PartnerDocRow {
  id: string;
  name: string | null;
  doc_type: string | null;
  file_name: string | null;
  file_url: string | null;
  status: string | null;
  expires_at: string | null;
  notes: string | null;
  preview_image_path: string | null;
  created_at: string | null;
}

export type DocStatus = "verified" | "pending" | "expired" | "rejected" | "required";

export interface PartnerDoc {
  id: string;
  name: string;
  docType: string;
  kind: string;
  status: DocStatus;
  expires: string;
  required: boolean;
  icon: string;
  fileName: string;
  fileUrl: string | null;
  warning?: string;
}

// Canonical required documents — mirrors master-os REQUIRED_PARTNER_DOCS (doc_type values must
// match so the OS compliance/verification recognises portal uploads). A partner can only use the
// platform once all of these are on file (uploaded — pending review is enough to unlock).
export const REQUIRED_PARTNER_DOCS = [
  { docType: "id_proof", name: "Photo ID", description: "Passport or driving license" },
  { docType: "proof_of_address", name: "Proof of Address", description: "Utility bill or bank statement (last 3 months)" },
  { docType: "right_to_work", name: "Right to Work", description: "Share code, birth certificate, or passport" },
  { docType: "insurance", name: "Public Liability Insurance", description: "Active public liability policy" },
] as const;

// Required doc_types still missing (no uploaded row, or only a rejected one). Empty = unlocked.
export function missingRequiredDocs(docs: Pick<PartnerDoc, "docType" | "status">[]): typeof REQUIRED_PARTNER_DOCS[number][] {
  return REQUIRED_PARTNER_DOCS.filter(
    (req) => !docs.some((d) => d.docType === req.docType && d.status !== "rejected"),
  );
}

const LONDON = "Europe/London";
function fmtMonthYear(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: LONDON });
}

// Days until expiry (positive = future). Null when no expiry.
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const ICON_BY_TYPE: Record<string, string> = {
  insurance: "umbrella",
  certification: "graduation-cap",
  license: "badge-check",
  contract: "file-text",
  tax: "receipt",
  id_proof: "badge-check",
  other: "file",
};

const STATUS_MAP: Record<string, DocStatus> = {
  approved: "verified",
  verified: "verified",
  pending: "pending",
  expired: "expired",
  rejected: "rejected",
};

export function mapPartnerDoc(row: PartnerDocRow): PartnerDoc {
  const rawStatus = (row.status ?? "pending").toLowerCase();
  let status: DocStatus = STATUS_MAP[rawStatus] ?? "pending";
  const days = daysUntil(row.expires_at);
  if (status === "verified" && days != null && days <= 0) status = "expired";
  const docType = (row.doc_type ?? "other").toLowerCase();

  let warning: string | undefined;
  if (status === "verified" && days != null && days > 0 && days <= 90) {
    warning = `${days} day${days === 1 ? "" : "s"} to expiry`;
  }

  return {
    id: row.id,
    name: row.name || "Document",
    docType,
    kind: row.notes || prettyType(docType),
    status,
    expires: fmtMonthYear(row.expires_at),
    // partner_documents has no compliance flag column — a doc is "required" when its type is one
    // of the mandatory REQUIRED_PARTNER_DOCS.
    required: REQUIRED_PARTNER_DOCS.some((r) => r.docType === docType),
    icon: ICON_BY_TYPE[docType] ?? "file",
    fileName: row.file_name || `${(row.name || "document").toLowerCase().replace(/\s+/g, "-")}.pdf`,
    fileUrl: row.file_url,
    warning,
  };
}

function prettyType(t: string): string {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function fetchPartnerDocuments(supabase: SupabaseClient, partnerId: string): Promise<PartnerDoc[]> {
  const { data, error } = await supabase
    .from("partner_documents")
    .select(PARTNER_DOC_SELECT)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as PartnerDocRow[]).map(mapPartnerDoc);
}
