/**
 * Notify Master OS after a partner claims an auto-assign job in the trade portal.
 * Fire-and-forget — the job is already scheduled in Supabase before this runs.
 */
export async function notifyMasterOsPartnerPortalAccept(
  jobId: string,
  partnerId: string,
): Promise<void> {
  const secret = process.env.INTERNAL_SYNC_SECRET?.trim();
  const base =
    process.env.MASTER_OS_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.OS_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://app.getfixfy.com";

  if (!secret) {
    console.error("[portal-accept] INTERNAL_SYNC_SECRET not set — skipping OS finalize");
    return;
  }

  const res = await fetch(`${base}/api/internal/jobs/partner-portal-accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ jobId, partnerId }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    console.error(
      "[portal-accept] OS finalize failed:",
      res.status,
      payload.error ?? res.statusText,
    );
  }
}
