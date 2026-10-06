// POST /api/auth/signup  { email, fullName, company }
//
// Self-registration for new trades. Creates the auth user + public.users (external_partner) +
// public.partners row (free to join: no plan, no trial, no card) and signs the browser in right away
// ({ signedIn: true }). The funnel never asks for an email code: new emails, logins coming back
// to finish onboarding and inactive / on-break accounts (reactivated here) all go straight in.
// The code email is only the fallback if signing in fails. Active partners sign in at /login.
// The partner the
// portal resolves from the session (partner-auth) is this same partners row.

import { NextResponse, type NextRequest } from "next/server";
import { claimPartnerInvite, sendSignInCode } from "@/lib/partner-auth-claim";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOtpEmail, sendNewPartnerAdminNotification } from "@/lib/email";
import { EMAIL_UNVERIFIED_REASON } from "@/lib/partner-onboarding-flags";
import { signInWithoutCode } from "@/lib/partner-signin-without-code";


export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // `plan` from older clients is ignored: paid partner plans were retired on 6 October 2026.
  let body: { email?: unknown; fullName?: unknown; company?: unknown; inviteCode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Enter your company or trading name." }, { status: 400 });

  const admin = createServiceClient();

  const { data: existingPartnerRows } = await admin
    .from("partners")
    .select("id, auth_user_id, status, partner_status_reasons")
    .ilike("email", email)
    // Older duplicates (a draft next to the real account): the one with a login wins.
    .order("auth_user_id", { ascending: true, nullsFirst: false })
    .limit(1);
  const existingPartner = existingPartnerRows?.[0] as {
    id: string;
    auth_user_id?: string | null;
    status?: string | null;
    partner_status_reasons?: string[] | null;
  } | undefined;

  // Resume branch — instead of hard-blocking with 409, let onboarding /
  // inactive partners resume the wizard from where they stopped. We re-send
  // the OTP to prove email ownership; the actual reactivation happens on
  // successful verify, not here (avoids anyone flipping partner state simply
  // by hitting this endpoint).
  if (existingPartner?.auth_user_id?.trim()) {
    const status = String(existingPartner.status ?? "").trim();
    const resumable = status === "onboarding" || status === "inactive" || status === "on_break";
    if (resumable) {
      // Back into the funnel without a code. Inactive / on-break accounts go
      // back to onboarding; other reason codes stay visible to the office.
      if (await signInWithoutCode(admin, email, existingPartner.id)) {
        const reactivate = status !== "onboarding";
        if (reactivate) {
          const reasons = (existingPartner.partner_status_reasons ?? []).filter(
            (r) => r !== "on_break" && r !== EMAIL_UNVERIFIED_REASON,
          );
          const { error: reactivateErr } = await admin
            .from("partners")
            .update({ status: "onboarding", partner_status_reasons: reasons })
            .eq("id", existingPartner.id);
          if (reactivateErr) console.error("[auth/signup] reactivate error:", reactivateErr);
        }
        return NextResponse.json({ ok: true, resume: reactivate ? "reactivate" : "onboarding", signedIn: true });
      }
      let devCode: string | undefined;
      let emailError: string | undefined;
      const { data: link, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const otpCode = link?.properties?.email_otp;
      if (!genErr && otpCode) {
        if (process.env.NODE_ENV !== "production") devCode = otpCode;
        try {
          await sendOtpEmail(email, otpCode);
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e);
          console.error("[auth/signup] resume OTP email send failed:", e);
        }
      } else if (genErr) {
        console.error("[auth/signup] resume generateLink failed:", genErr);
      }
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json({
        ok: true,
        resume: status === "inactive" || status === "on_break" ? "reactivate" : "onboarding",
        ...(dev && devCode ? { devCode } : {}),
        ...(dev && emailError ? { emailError } : {}),
      });
    }
    return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
  }

  if (existingPartner?.id) {
    if (existingPartner?.auth_user_id?.trim()) {
      return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
    }
    try {
      const result = await claimPartnerInvite(admin, {
        email,
        inviteCode: inviteCode || undefined,
        fullName,
        company,
        sendCode: false,
      });
      // Notify ops so they can approve fast (fire-and-forget — never block signup).
      void sendNewPartnerAdminNotification({ email, contactName: fullName, companyName: company }).catch((e) =>
        console.error("[auth/signup] admin notification (claim) failed:", e),
      );
      if (await signInWithoutCode(admin, email, result.partnerId)) {
        return NextResponse.json({ ok: true, claimed: true, signedIn: true });
      }
      // Couldn't sign in here: fall back to the code so they're never stuck.
      const sent = await sendSignInCode(admin, email);
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json({
        ok: true,
        claimed: true,
        ...(dev && sent.devCode ? { devCode: sent.devCode } : {}),
        ...(dev && sent.emailError ? { emailError: sent.emailError } : {}),
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      return NextResponse.json({ error: err.message || "Couldn't claim invite." }, { status: err.status ?? 500 });
    }
  }

  const { data: existingUser } = await admin.from("users").select("id").ilike("email", email).limit(1);
  if ((existingUser?.length ?? 0) > 0) {
    return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
  }

  // 1) Auth user (email pre-confirmed so the OTP sign-in works immediately).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, company, role: "external_partner" },
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? "").toLowerCase();
    if (msg.includes("already")) return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 500 });
  }
  const userId = created.user.id;

  // 2) App user row (external_partner) — the linkage the portal + OS expect. The handle_new_user
  //    trigger already inserted a public.users row (with a non-partner default type), so UPSERT to
  //    flip it to external_partner rather than insert (which would hit users_pkey).
  const { error: usersErr } = await admin
    .from("users")
    .upsert({ id: userId, email, full_name: fullName, user_type: "external_partner", userActive: true }, { onConflict: "id" });
  if (usersErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[auth/signup] users upsert failed:", usersErr);
    return NextResponse.json({ error: "Couldn't set up your account. Try again." }, { status: 500 });
  }

  // 3) Partner row. Joining is free: no plan, trial or card. Operational data keys off partners.id.
  const { data: partnerRow, error: partnerErr } = await admin.from("partners").insert({
    auth_user_id: userId,
    email,
    company_name: company,
    contact_name: fullName,
    phone: null,
    trade: "",
    trades: [],
    location: "",
    status: "onboarding",
    // Got here past the details step, so the office sees them in Onboarding
    // right away (see partner-onboarding-flags).
    partner_status_reasons: [],
    verified: false,
  }).select("id").single();
  if (partnerErr) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[auth/signup] partners insert failed:", partnerErr);
    return NextResponse.json({ error: "Couldn't set up your trade profile. Try again." }, { status: 500 });
  }

  // Notify ops of the new registration so they can approve fast (fire-and-forget).
  void sendNewPartnerAdminNotification({ email, contactName: fullName, companyName: company }).catch((e) =>
    console.error("[auth/signup] admin notification failed:", e),
  );

  // 4) Sign them in now; the code email is only the fallback.
  const partnerId = (partnerRow as { id: string }).id;
  if (await signInWithoutCode(admin, email, partnerId)) {
    return NextResponse.json({ ok: true, signedIn: true });
  }
  const { devCode, emailError } = await sendSignInCode(admin, email);

  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    ok: true,
    ...(dev && devCode ? { devCode } : {}),
    ...(dev && emailError ? { emailError } : {}),
  });
}
