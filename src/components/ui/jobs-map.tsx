"use client";

// Real Mapbox map of the partner's jobs, plotted from jobs.latitude/longitude (geocoded by
// the OS). Markers are coloured by status and open the job on click. Falls back to a message
// when the Mapbox token isn't set or no jobs have coordinates.

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";
import type { MyJob } from "@/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const STATUS_COLOR: Record<string, string> = {
  scheduled: T.blue,
  in_progress: T.coral,
  final_check: T.amber,
  completed: T.green,
  cancelled: T.mute,
};

export function JobsMap({ jobs, onOpenJob, minHeight = 460 }: { jobs: MyJob[]; onOpenJob: (id: string) => void; minHeight?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const openRef = useRef(onOpenJob);
  openRef.current = onOpenJob;

  // Init the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-0.118, 51.495],
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // (Re)plot markers when jobs change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const located = jobs.filter((j) => typeof j.lat === "number" && typeof j.lng === "number");
    if (located.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    located.forEach((j) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", j.title);
      el.style.cssText =
        "width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;cursor:pointer;box-shadow:0 2px 6px rgba(2,0,64,0.3);padding:0";
      el.style.background = STATUS_COLOR[j.status] ?? T.blue;
      el.addEventListener("click", () => openRef.current(j.id));
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([j.lng as number, j.lat as number])
        .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(`${j.title} · ${j.postcode || ""}`))
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([j.lng as number, j.lat as number]);
    });

    if (located.length === 1) {
      map.flyTo({ center: [located[0].lng as number, located[0].lat as number], zoom: 13, duration: 0 });
    } else {
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
    }
  }, [jobs]);

  if (!TOKEN) {
    return (
      <div style={{ minHeight, display: "flex", alignItems: "center", justifyContent: "center", color: T.mute, fontSize: 13, gap: 8, background: T.paper2 }}>
        <Icon name="map-pin" size={16} color={T.mute} /> Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN.
      </div>
    );
  }

  const anyLocated = jobs.some((j) => typeof j.lat === "number" && typeof j.lng === "number");
  return (
    <div style={{ position: "relative", minHeight }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {!anyLocated && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: T.slate, fontSize: 13 }}>
          <span style={{ background: "rgba(255,255,255,0.9)", padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.line}` }}>
            No jobs with a mapped location yet.
          </span>
        </div>
      )}
    </div>
  );
}
