import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/accept-config
 * Smoke check after Vercel env setup — does not expose secret values.
 */
export async function GET() {
  const hasSecret = Boolean(process.env.INTERNAL_SYNC_SECRET?.trim());
  const hasOsUrl = Boolean(
    process.env.MASTER_OS_BASE_URL?.trim() || process.env.OS_BASE_URL?.trim(),
  );
  const hasServiceRole = Boolean(
    process.env.SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const ok = hasSecret && hasOsUrl && hasServiceRole;

  return NextResponse.json(
    {
      ok,
      acceptConfigured: ok,
      checks: {
        internalSyncSecret: hasSecret,
        masterOsBaseUrl: hasOsUrl,
        serviceRoleKey: hasServiceRole,
      },
      ...(ok
        ? {}
        : {
            hint: "Set INTERNAL_SYNC_SECRET, MASTER_OS_BASE_URL, and SERVICE_ROLE_KEY on Vercel (Production + Preview), then redeploy.",
          }),
    },
    { status: ok ? 200 : 503 },
  );
}
