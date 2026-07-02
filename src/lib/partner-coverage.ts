// Minimal coverage completeness checks — aligned with master-os partner-coverage.ts.

export type PartnerCoverageFields = {
  coverage_mode?: string | null;
  service_radius_miles?: number | null;
  coverage_latitude?: number | null;
  coverage_longitude?: number | null;
  included_postcodes?: string[] | null;
  location?: string | null;
};

function effectiveCoverageMode(partner: PartnerCoverageFields): "radius" | "postcodes" | null {
  const m = partner.coverage_mode;
  if (m === "radius" || m === "postcodes") return m;
  const hasRadius =
    Number(partner.service_radius_miles ?? 0) > 0 &&
    partner.coverage_latitude != null &&
    partner.coverage_longitude != null;
  const hasPostcodes = (partner.included_postcodes?.length ?? 0) > 0;
  if (hasRadius && !hasPostcodes) return "radius";
  if (hasPostcodes) return "postcodes";
  if (partner.location?.trim()) return "postcodes";
  return null;
}

export function partnerCoverageIsComplete(partner: PartnerCoverageFields): boolean {
  const mode = effectiveCoverageMode(partner) ?? "postcodes";
  if (mode === "radius") {
    const miles = Number(partner.service_radius_miles ?? 0);
    return (
      miles > 0 &&
      partner.coverage_latitude != null &&
      partner.coverage_longitude != null &&
      Number.isFinite(partner.coverage_latitude) &&
      Number.isFinite(partner.coverage_longitude)
    );
  }
  return (partner.included_postcodes?.length ?? 0) > 0;
}
