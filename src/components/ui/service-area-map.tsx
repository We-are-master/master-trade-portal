"use client";

// Real Mapbox map for the "Service area" step/settings: geocodes the partner's postcode (Mapbox
// Geocoding API), centres there, and draws the coverage radius as a circle that updates live as
// the postcode/radius change. Falls back to the decorative MapBackground when no token is set.
// A ResizeObserver calls map.resize() so it renders correctly inside the onboarding modal.

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapBackground } from "@/components/ui/map-background";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const LONDON: [number, number] = [-0.118, 51.495];

// Approximate geodesic circle as a 64-point polygon (no turf dependency).
function circlePolygon(center: [number, number], radiusMiles: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lng, lat] = center;
  const km = Math.max(0.5, radiusMiles) * 1.60934;
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function ServiceAreaMap({ postcode, radiusMiles, minHeight = 320 }: { postcode: string; radiusMiles: number; minHeight?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const centerRef = useRef<[number, number]>(LONDON);
  const [ready, setReady] = useState(false);

  // Init the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: LONDON,
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("area", { type: "geojson", data: circlePolygon(centerRef.current, radiusMiles) });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#ED4B00", "fill-opacity": 0.12 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#ED4B00", "line-width": 1.5, "line-dasharray": [2, 1] } });
      setReady(true);
    });
    mapRef.current = map;

    // Modal/flex containers are often 0-sized at init — keep the canvas in sync.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocode the postcode → recentre + drop a pin + recolour the radius.
  useEffect(() => {
    if (!TOKEN || !postcode.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(postcode.trim())}.json?country=gb&types=postcode,place&limit=1&access_token=${TOKEN}`;
        const json = await (await fetch(url)).json();
        const c = json?.features?.[0]?.center as [number, number] | undefined;
        const map = mapRef.current;
        if (!c || cancelled || !map) return;
        centerRef.current = c;
        map.flyTo({ center: c, zoom: 9, essential: true });
        if (markerRef.current) markerRef.current.setLngLat(c);
        else markerRef.current = new mapboxgl.Marker({ color: "#020040" }).setLngLat(c).addTo(map);
        (map.getSource("area") as mapboxgl.GeoJSONSource | undefined)?.setData(circlePolygon(c, radiusMiles));
      } catch {
        /* geocode failed — leave the map where it is */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

  // Radius slider → resize the circle around the current centre.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("area") as mapboxgl.GeoJSONSource | undefined)?.setData(circlePolygon(centerRef.current, radiusMiles));
  }, [radiusMiles, ready]);

  if (!TOKEN) {
    return (
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", minHeight, background: "#E8EAF0" }}>
        <MapBackground />
      </div>
    );
  }
  return <div ref={containerRef} style={{ borderRadius: 12, overflow: "hidden", minHeight, height: minHeight }} />;
}
