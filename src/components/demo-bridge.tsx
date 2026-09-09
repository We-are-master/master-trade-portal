"use client";

// Serves the `/api/*` calls the screens make from demo fixtures, so nothing
// reaches the server while demoing. Mounted once by Providers; inert unless
// DEMO_ENABLED, and DEMO_ENABLED is false in any production build.

import { useEffect } from "react";
import { DEMO_ENABLED } from "@/lib/demo/demo-mode";
import { DEMO_API } from "@/lib/demo/demo-data";

let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const real = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];

    if (path.startsWith("/api/")) {
      const canned = DEMO_API[path];
      if (canned !== undefined) {
        return new Response(JSON.stringify(canned), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Anything not stubbed is a write (accept a job, submit a bid, upload a
      // doc). Acknowledge it so the UI completes its flow, but change nothing.
      return new Response(JSON.stringify({ ok: true, demo: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return real(input as RequestInfo, init);
  };
}

export function DemoBridge() {
  // Install before paint so the first data fetch is already intercepted.
  if (DEMO_ENABLED) install();
  useEffect(() => {
    if (DEMO_ENABLED) install();
  }, []);
  return null;
}
