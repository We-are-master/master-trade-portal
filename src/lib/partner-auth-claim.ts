import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOtpEmail } from "@/lib/email";
import { resolvePartnerJoinInvite } from "@/lib/partner-join-invite";

type AdminClient = SupabaseClient;

export type ClaimPartnerInviteInput = {
  email: string;
  inviteCode?: string;
  fullName?: string;
  company?: string;
};

export type ClaimPartnerInviteResult = {
  ok: true;
  partnerId: string;
  createdAuth: boolean;
  devCode?: string;
  emailError?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolvePartnerIdForClaim(
  admin: AdminClient,
  email: string,
  inviteCode?: string,
  fullName?: string,
  company?: string,
): Promise<{ partnerId: string; contactName: string; companyName: string }> {
  let partnerId: string;
  let contactName = fullName?.trim() || "";
  let companyName = company?.trim() || "";

  if (inviteCode?.trim()) {
    const invite = await resolvePartnerJoinInvite(admin, inviteCode.trim());
    if (!invite) {
      throw Object.assign(new Error("This invite link has expired or is invalid."), { status: 401 });
    }
    if (invite.email.toLowerCase() !== email) {
      throw Object.assign(new Error("Use the same email address this invite was sent to."), { status: 422 });
    }
    if (invite.authUserId) {
      throw Object.assign(new Error("This invite was already used. Sign in instead."), { status: 409 });
    }
    partnerId = invite.partnerId;
    contactName = contactName || invite.contactName;
    companyName = companyName || invite.companyName || invite.contactName;
  } else {
    const { data } = await admin
      .from("partners")
      .select("id, contact_name, company_name, auth_user_id, status")
      .ilike("email", email)
      .limit(1);
    const row = data?.[0] as {
      id: string;
      contact_name?: string | null;
      company_name?: string | null;
      auth_user_id?: string | null;
      status?: string | null;
    } | undefined;
    if (!row?.id || row.auth_user_id?.trim()) {
      throw Object.assign(new Error("No pending invite found for this email."), { status: 404 });
    }
    if (row.status && row.status !== "onboarding") {
      throw Object.assign(new Error("No pending invite found for this email."), { status: 404 });
    }
    partnerId = row.id;
    contactName = contactName || row.contact_name?.trim() || "";
    companyName = companyName || row.company_name?.trim() || contactName;
  }

  const { data: partnerRow } = await admin
    .from("partners")
    .select("id, auth_user_id")
    .eq("id", partnerId)
    .maybeSingle();
  if ((partnerRow as { auth_user_id?: string | null } | null)?.auth_user_id?.trim()) {
    throw Object.assign(new Error("This email already has a Trade Portal account. Sign in instead."), { status: 409 });
  }

  const displayName = contactName || companyName || "Partner";
  return { partnerId, contactName: displayName, companyName: companyName || displayName };
}

export async function provisionPartnerAuthUser(
  admin: AdminClient,
  partnerId: string,
  email: string,
  contactName: string,
  companyName: string,
): Promise<{ userId: string; createdAuth: boolean }> {
  const { data: existingUsers } = await admin.from("users").select("id").ilike("email", email).limit(1);
  const existingId = (existingUsers?.[0] as { id?: string } | undefined)?.id;
  let userId: string;
  let createdAuth = false;

  if (existingId) {
    userId = existingId;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: contactName, company: companyName, role: "external_partner" },
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already")) {
        throw Object.assign(new Error("That email is already registered. Sign in instead."), { status: 409 });
      }
      throw Object.assign(new Error("Couldn't create your account. Try again."), { status: 500 });
    }
    userId = created.user.id;
    createdAuth = true;
  }

  const { error: usersErr } = await admin.from("users").upsert(
    { id: userId, email, full_name: contactName, user_type: "external_partner", userActive: true },
    { onConflict: "id" },
  );
  if (usersErr) {
    if (createdAuth) await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw Object.assign(new Error("Couldn't set up your account. Try again."), { status: 500 });
  }

  const { error: partnerErr } = await admin
    .from("partners")
    .update({
      auth_user_id: userId,
      contact_name: contactName,
      company_name: companyName,
      status: "onboarding",
    })
    .eq("id", partnerId);
  if (partnerErr) {
    throw Object.assign(new Error("Couldn't link your partner profile. Try again."), { status: 500 });
  }

  return { userId, createdAuth };
}

/** Create auth user + link partners.auth_user_id for an OS-invited partner without portal login yet. */
export async function claimPartnerInvite(
  admin: AdminClient,
  input: ClaimPartnerInviteInput,
): Promise<ClaimPartnerInviteResult> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Enter a valid email."), { status: 400 });
  }

  const { partnerId, contactName, companyName } = await resolvePartnerIdForClaim(
    admin,
    email,
    input.inviteCode,
    input.fullName,
    input.company,
  );

  const { createdAuth } = await provisionPartnerAuthUser(admin, partnerId, email, contactName, companyName);

  let devCode: string | undefined;
  let emailError: string | undefined;
  const { data: link, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link?.properties?.email_otp;
  if (!genErr && otp) {
    if (process.env.NODE_ENV !== "production") devCode = otp;
    try {
      await sendOtpEmail(email, otp);
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: true, partnerId, createdAuth, devCode, emailError };
}

/** Ensure auth.users exists and partners.auth_user_id is set before OTP generateLink. */
export async function ensureAuthUserForPartner(
  admin: AdminClient,
  partnerId: string,
  email: string,
): Promise<void> {
  const { data: partner } = await admin
    .from("partners")
    .select("id, auth_user_id, contact_name, company_name")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return;
  if ((partner as { auth_user_id?: string | null }).auth_user_id?.trim()) return;

  const contactName =
    (partner as { contact_name?: string | null }).contact_name?.trim() ||
    (partner as { company_name?: string | null }).company_name?.trim() ||
    "Partner";
  const companyName = (partner as { company_name?: string | null }).company_name?.trim() || contactName;

  await provisionPartnerAuthUser(admin, partnerId, normalizeEmail(email), contactName, companyName);
}
