// POST /api/auth/signup  { email, fullName, company }
//
// Self-registration for new trades. Creates the auth user + public.users (external_partner) +
// public.partners row with a 7-day free trial (no card), then emails a 6-digit OTP via Resend so
// they can sign in. After verifying the code the app opens the onboarding flow. The partner the
// portal resolves from the session (partner-auth) is this same partners row.

import { NextResponse, type NextRequest } from "next/server";
import { claimPartnerInvite } from "@/lib/partner-auth-claim";
import { DEFAULT_PLAN_ID, parsePlanId, PARTNERS_LP_URL } from "@/lib/plan-catalog";
import { PARTNER_TRIAL_DAYS } from "@/lib/trial-config";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOtpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; fullName?: unknown; company?: unknown; inviteCode?: unknown; plan?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
  const planParam = typeof body.plan === "string" ? body.plan.trim() : "";
  const plan = parsePlanId(planParam) ?? DEFAULT_PLAN_ID;

  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Enter your company or trading name." }, { status: 400 });

  const admin = createServiceClient();

  const { data: existingPartnerRows } = await admin
    .from("partners")
    .select("id, auth_user_id, status")
    .ilike("email", email)
    .limit(1);
  const existingPartner = existingPartnerRows?.[0] as {
    id: string;
    auth_user_id?: string | null;
    status?: string | null;
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
      const result = await claimPartnerInvite(admin, { email, inviteCode: inviteCode || undefined, fullName, company, plan });
      const trialEnds = new Date(Date.now() + PARTNER_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("partners")
        .update({
          subscription_status: "trialing",
          trial_ends_at: trialEnds,
          plan,
        })
        .eq("id", result.partnerId)
        .is("trial_ends_at", null);
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json({
        ok: true,
        claimed: true,
        ...(dev && result.devCode ? { devCode: result.devCode } : {}),
        ...(dev && result.emailError ? { emailError: result.emailError } : {}),
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      return NextResponse.json({ error: err.message || "Couldn't claim invite." }, { status: err.status ?? 500 });
    }
  }

  // Self-signup requires a plan from the partners LP.
  if (!inviteCode && !parsePlanId(planParam)) {
    return NextResponse.json(
      { error: "Choose a plan at getfixfy.com/partners first.", redirect: PARTNERS_LP_URL },
      { status: 422 },
    );
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

  // 3) Partner row with a 7-day free trial (no card). Operational data keys off partners.id.
  const trialEnds = new Date(Date.now() + PARTNER_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: partnerErr } = await admin.from("partners").insert({
    auth_user_id: userId,
    email,
    company_name: company,
    contact_name: fullName,
    phone: null,
    trade: "",
    trades: [],
    location: "",
    status: "onboarding",
    verified: false,
    subscription_status: "trialing",
    plan,
    trial_ends_at: trialEnds,
  });
  if (partnerErr) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[auth/signup] partners insert failed:", partnerErr);
    return NextResponse.json({ error: "Couldn't set up your trade profile. Try again." }, { status: 500 });
  }

  // 4) Email the 6-digit sign-in code (generateLink itself sends nothing).
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
      console.error("[auth/signup] OTP email send failed:", e);
    }
  } else if (genErr) {
    console.error("[auth/signup] generateLink failed:", genErr);
  }

  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    ok: true,
    trialDays: PARTNER_TRIAL_DAYS,
    ...(dev && devCode ? { devCode } : {}),
    ...(dev && emailError ? { emailError } : {}),
  });
}
