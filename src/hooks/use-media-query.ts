"use client";

// Viewport queries for a codebase that styles inline — media queries can't reach
// inline styles, so layout branches read the breakpoint from JS instead.

import { useEffect, useState } from "react";

/** Below this the sidebar is replaced by the bottom tab bar. */
export const MOBILE_BREAKPOINT = 900;

export function useMediaQuery(query: string): boolean {
  // Start false so server and first client render agree; the effect corrects it
  // before paint on the client.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
