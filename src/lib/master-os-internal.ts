/**
 * Delegate auto-assign job accept to Master OS — same path as email "Accept job" CTA.
 * OS performs atomic claim, invite bookkeeping, Job booked Zendesk email, and ticket sync.
 */

export type MasterOsPartnerPortalAcceptResult =
  | {
      ok: true;
      accepted: true;
      jobReference: string;
      alreadyConfirmed?: boolean;
      claimed?: boolean;
    }
  | {
      ok: false;
      accepted: false;
      status: number;
      error: string;
      message?: string;
      code?: string;
    };

export async function callMasterOsPartnerPortalAccept(
  jobId: string,
  partnerId: string,
): Promise<MasterOsPartnerPortalAcceptResult> {
  const secret = process.env.INTERNAL_SYNC_SECRET?.trim();
  const base =
    process.env.MASTER_OS_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.OS_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://app.getfixfy.com";

  if (!secret) {
    console.error("[portal-accept] INTERNAL_SYNC_SECRET not set — cannot accept via OS");
    return {
      ok: false,
      accepted: false,
      status: 503,
      error: "accept_not_configured",
      code: "accept_not_configured",
      message:
        "Job accept is not configured on the portal (INTERNAL_SYNC_SECRET). Use the email Accept link or contact support.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/internal/jobs/partner-portal-accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ jobId, partnerId }),
    });
  } catch (err) {
    console.error("[portal-accept] OS fetch failed:", err);
    return {
      ok: false,
      accepted: false,
      status: 502,
      error: "os_unreachable",
      message: `Could not reach Master OS at ${base}. Try again or use the email Accept link.`,
    };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    accepted?: boolean;
    error?: string;
    message?: string;
    code?: string;
    jobReference?: string;
    alreadyConfirmed?: boolean;
    claimed?: boolean;
  };

  if (!res.ok || !payload.ok || !payload.accepted) {
    console.error(
      "[portal-accept] OS accept failed:",
      res.status,
      payload.error ?? res.statusText,
      payload.message,
    );
    const unauthorized = res.status === 401;
    return {
      ok: false,
      accepted: false,
      status: res.status,
      error: payload.error ?? "accept_failed",
      message:
        payload.message ??
        (unauthorized
          ? "Portal could not authenticate with Master OS (check INTERNAL_SYNC_SECRET matches on both apps)."
          : res.status === 500 && payload.error === "Endpoint not configured."
            ? "Master OS accept endpoint is not configured (INTERNAL_SYNC_SECRET on OS)."
            : undefined),
      code: payload.code ?? (unauthorized ? "os_unauthorized" : undefined),
    };
  }

  return {
    ok: true,
    accepted: true,
    jobReference: payload.jobReference ?? "",
    alreadyConfirmed: payload.alreadyConfirmed,
    claimed: payload.claimed,
  };
}

/** @deprecated Use callMasterOsPartnerPortalAccept — kept for any stale imports. */
export const notifyMasterOsPartnerPortalAccept = callMasterOsPartnerPortalAccept;
