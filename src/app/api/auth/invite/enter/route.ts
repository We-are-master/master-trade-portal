import { NextResponse, type NextRequest } from "next/server";
import { enterPartnerInvite } from "@/lib/partner-invite-enter";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function loginFallbackUrl(req: NextRequest, email?: string, inviteCode?: string): URL {
  const url = new URL("/login", req.url);
  if (email) url.searchParams.set("email", email);
  if (inviteCode) url.searchParams.set("invite", inviteCode);
  url.searchParams.set("invite_error", "1");
  return url;
}

/** GET /api/auth/invite/enter?invite= — one-click OS invite → session + onboarding. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const inviteCode = (params.get("invite") || params.get("token") || "").trim();
  if (!inviteCode) {
    return NextResponse.redirect(loginFallbackUrl(req));
  }

  try {
    const admin = createServiceClient();
    const supabase = await createClient();
    const result = await enterPartnerInvite(admin, supabase, inviteCode);

    if (!result.ok) {
      return NextResponse.redirect(loginFallbackUrl(req, result.email, result.inviteCode));
    }

    const redirectUrl = new URL("/", req.url);
    redirectUrl.searchParams.set("welcome", "1");
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    console.error("[auth/invite/enter]", e);
    return NextResponse.redirect(loginFallbackUrl(req));
  }
}
