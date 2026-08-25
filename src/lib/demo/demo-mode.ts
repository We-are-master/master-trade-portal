/**
 * Demo mode — a fake signed-in partner with fake data, for showing the portal
 * without a database or a real account.
 *
 * Turn it on with `NEXT_PUBLIC_DEMO_MODE=1` in `.env.local`, then `npm run dev`.
 *
 * SAFETY: this bypasses authentication completely, so it is hard-gated to
 * non-production builds. `next build` sets NODE_ENV=production, which means the
 * flag is inert in any deployed bundle even if the env var leaks into it — the
 * checks below fold to `false` at build time and the fixtures tree-shake out.
 * Never relax this into a runtime-only flag.
 */

export const DEMO_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export function isDemoMode(): boolean {
  return DEMO_ENABLED;
}
