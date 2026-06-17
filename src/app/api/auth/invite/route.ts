import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/partner-auth-claim";
import { resolvePartnerJoinInvite } from "@/lib/partner-join-invite";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** GET /api/auth/invite?code= — prefill Trade Portal login for an OS-invited partner. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const invite = await resolvePartnerJoinInvite(supabase, code);
    if (!invite) {
      return NextResponse.json({ error: "This invite link has expired or is invalid." }, { status: 401 });
    }

    const authUserId = invite.authUserId || (await findAuthUserIdByEmail(supabase, invite.email));

    return NextResponse.json({
      ok: true,
      email: invite.email,
      contactName: invite.contactName,
      companyName: invite.companyName,
      expiresAt: invite.expiresAt,
      hasAuth: Boolean(authUserId),
    });
  } catch (e) {
    console.error("[auth/invite]", e);
    return NextResponse.json({ error: "Couldn't load invite." }, { status: 500 });
  }
}
