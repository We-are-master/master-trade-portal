// POST /api/auth/request-otp  { email }
// Generates a sign-in OTP server-side via admin.generateLink (this does NOT send any
// email) and delivers the 6-digit code via Resend — only to addresses that belong to a
// partner. Always returns { ok: true } (enumeration defence).

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOtpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (!email || !email.includes("@")) return NextResponse.json({ ok: true });

  let devCode: string | undefined;
  let emailError: string | undefined;
  let genError: string | undefined;
  try {
    const admin = createServiceClient();

    // Gate to partners: send a code only if the email belongs to a partner — either an
    // external_partner app user (public.users) OR a partners row (covers partners created in
    // the OS directly). Checked BEFORE generateLink so random emails never create an auth user.
    // limit(1) (not maybeSingle) so duplicate emails don't throw and silently drop the code.
    const [appUsers, partnerRows] = await Promise.all([
      admin.from("users").select("id").ilike("email", email).eq("user_type", "external_partner").limit(1),
      admin.from("partners").select("id").ilike("email", email).limit(1),
    ]);
    const isPartner = (appUsers.data?.length ?? 0) > 0 || (partnerRows.data?.length ?? 0) > 0;
    if (!isPartner) {
      // Silent in prod (enumeration defence); in dev, say so — a common "no email" cause.
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json(dev ? { ok: true, notPartner: true } : { ok: true });
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) genError = error.message;
    if (!error && data?.user) {
      const otp = data.properties?.email_otp;
      if (otp) {
        // Dev convenience: surface the code on localhost so you can sign in even when
        // email delivery isn't configured (e.g. invalid RESEND_API_KEY). Never in prod.
        if (process.env.NODE_ENV !== "production") devCode = otp;
        try {
          await sendOtpEmail(email, otp);
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e);
          console.error("[auth/request-otp] email send failed (check RESEND_API_KEY / verified RESEND_FROM_EMAIL domain):", e);
        }
      } else {
        genError = genError ?? "No OTP returned by Supabase generateLink.";
      }
    }
  } catch (err) {
    genError = err instanceof Error ? err.message : String(err);
    console.error("[auth/request-otp]", err);
  }

  // In dev, return the code + any send/generate error so you can sign in and diagnose without
  // depending on email delivery. In production only { ok: true } (enumeration defence).
  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    ok: true,
    ...(dev && devCode ? { devCode } : {}),
    ...(dev && emailError ? { emailError } : {}),
    ...(dev && genError ? { genError } : {}),
  });
}
