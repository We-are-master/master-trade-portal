import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePartnerJoinInvite } from "@/lib/partner-join-invite";
import { provisionPartnerAuthUser } from "@/lib/partner-auth-claim";

type AdminClient = SupabaseClient;

export type EnterPartnerInviteResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number; email?: string; inviteCode?: string };

function normalizeInviteCode(invite?: string | null, token?: string | null): string {
  return (invite?.trim() || token?.trim() || "").trim();
}

/** Validate OS invite, provision auth if needed, and establish a portal session (no OTP email). */
export async function enterPartnerInvite(
  admin: AdminClient,
  sessionClient: SupabaseClient,
  inviteCode: string,
): Promise<EnterPartnerInviteResult> {
  const code = normalizeInviteCode(inviteCode);
  if (!code) {
    return { ok: false, error: "Invite code required.", status: 400 };
  }

  const invite = await resolvePartnerJoinInvite(admin, code);
  if (!invite) {
    return {
      ok: false,
      error: "This invite link has expired or is invalid.",
      status: 401,
      inviteCode: code,
    };
  }

  const email = invite.email.trim().toLowerCase();
  const contactName = invite.contactName || invite.companyName || "Partner";
  const companyName = invite.companyName || contactName;

  if (!invite.authUserId) {
    try {
      await provisionPartnerAuthUser(admin, invite.partnerId, email, contactName, companyName);
    } catch (e) {
      const err = e as Error & { status?: number };
      return {
        ok: false,
        error: err.message || "Couldn't set up your account. Try again.",
        status: err.status ?? 500,
        email,
        inviteCode: code,
      };
    }
  }

  const { data: link, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (genErr || !tokenHash) {
    return {
      ok: false,
      error: "Couldn't sign you in. Try again.",
      status: 500,
      email,
      inviteCode: code,
    };
  }

  const { error: verifyErr } = await sessionClient.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (verifyErr) {
    return {
      ok: false,
      error: "Couldn't sign you in. Try again.",
      status: 500,
      email,
      inviteCode: code,
    };
  }

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Couldn't sign you in. Try again.",
      status: 500,
      email,
      inviteCode: code,
    };
  }

  let { data: partner } = await sessionClient
    .from("partners")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!partner) {
    const { data: byEmail } = await admin
      .from("partners")
      .select("id, auth_user_id")
      .ilike("email", email)
      .limit(1);
    const row = byEmail?.[0] as { id: string; auth_user_id?: string | null } | undefined;
    if (row?.id && !row.auth_user_id?.trim()) {
      await admin.from("partners").update({ auth_user_id: user.id }).eq("id", row.id);
      partner = { id: row.id };
    }
  }
  if (!partner) {
    await sessionClient.auth.signOut();
    return {
      ok: false,
      error: "This email isn't registered as a Fixfy trade.",
      status: 403,
      email,
      inviteCode: code,
    };
  }

  return { ok: true, email };
}
