// Server-side UK postcode geocoding via Mapbox (same provider as client maps).

export type GeocodeResult = { latitude: number; longitude: number };

export async function geocodeUkPostcode(query: string): Promise<GeocodeResult | null> {
  const token =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    process.env.MAPBOX_TOKEN?.trim() ||
    "";
  const q = query.trim();
  if (!token || !q) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=gb&limit=1&access_token=${token}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { center?: [number, number] }[] };
    const center = json.features?.[0]?.center;
    if (!center || center.length < 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}
