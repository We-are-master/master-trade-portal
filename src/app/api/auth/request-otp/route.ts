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
    if (!isPartner) return NextResponse.json({ ok: true }); // not a partner — silent (enumeration defence)

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (!error && data?.user) {
      const otp = data.properties?.email_otp;
      if (otp) {
        // Dev convenience: surface the code on localhost so you can sign in even when
        // email delivery isn't configured (e.g. invalid RESEND_API_KEY). Never in prod.
        if (process.env.NODE_ENV !== "production") devCode = otp;
        try {
          await sendOtpEmail(email, otp);
        } catch (e) {
          console.error("[auth/request-otp] email send failed (set a valid RESEND_API_KEY):", e);
        }
      }
    }
  } catch (err) {
    console.error("[auth/request-otp]", err);
  }

  return NextResponse.json(devCode ? { ok: true, devCode } : { ok: true });
}
