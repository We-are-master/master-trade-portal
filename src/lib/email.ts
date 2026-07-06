// Resend email — sends the sign-in OTP ourselves so we don't depend on GoTrue SMTP
// (the self-hosted Supabase has no SMTP configured). SERVER ONLY.

import { Resend } from "resend";
import { T } from "@/lib/tokens";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function absoluteAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_TRADE_PORTAL_URL?.trim() ||
    "https://partners.getfixfy.com";
  return raw.replace(/\/$/, "");
}

function otpEmailHtml(code: string): string {
  const year = new Date().getUTCFullYear();
  const logoUrl = `${absoluteAppUrl()}/logos/fixfy-primary-navy.png`;
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Your Fixfy sign-in code</title>
  </head>
  <body style="margin:0;padding:0;background:${T.paper};font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;color:${T.ink};">
    <!-- preheader (hidden in body, previewed in inbox) -->
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">Your 6-digit Fixfy sign-in code — expires in a few minutes.</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.paper};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
            <!-- Header band -->
            <tr>
              <td style="background:#ffffff;padding:26px 28px 18px;border:1px solid ${T.line};border-bottom:none;border-radius:18px 18px 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <img src="${logoUrl}" alt="Fixfy" width="120" style="display:block;height:auto;max-width:120px;border:0;outline:none;" />
                    </td>
                    <td align="right" style="font-family:'SFMono-Regular','Menlo',monospace;font-size:10px;font-weight:700;letter-spacing:0.24em;color:${T.mute};">
                      TRADE PORTAL
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Card body -->
            <tr>
              <td style="background:#ffffff;padding:36px 32px 28px;border-left:1px solid ${T.line};border-right:1px solid ${T.line};">
                <p style="margin:0 0 6px;font-family:'SFMono-Regular','Menlo',monospace;font-size:11px;font-weight:700;letter-spacing:0.18em;color:${T.coral};text-transform:uppercase;">
                  Sign-in code
                </p>
                <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${T.navy};line-height:1.25;">
                  Enter this to continue
                </h1>
                <p style="margin:0 0 24px;font-size:14px;color:${T.slate};line-height:1.55;">
                  Paste the code below into the Fixfy Trade portal. It expires in a few minutes and only works once — for your safety, don&#39;t share it with anyone.
                </p>

                <!-- Code block -->
                <div style="background:${T.coralTint};border:1px solid rgba(237,75,0,0.18);border-radius:14px;padding:18px 20px;text-align:center;">
                  <div style="font-family:'SFMono-Regular','Menlo',monospace;font-size:34px;font-weight:700;letter-spacing:0.32em;color:${T.coral};line-height:1;">
                    ${code}
                  </div>
                  <p style="margin:12px 0 0;font-size:11px;color:${T.slate};letter-spacing:0.04em;">
                    Valid for a few minutes · single use
                  </p>
                </div>

                <p style="margin:26px 0 0;font-size:12px;color:${T.mute};line-height:1.55;">
                  Didn&#39;t try to sign in? You can safely ignore this email — no one can use the code without your inbox.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#ffffff;border-top:1px solid ${T.line};border-left:1px solid ${T.line};border-right:1px solid ${T.line};border-bottom:1px solid ${T.line};border-radius:0 0 18px 18px;padding:18px 32px 22px;">
                <p style="margin:0;font-size:11px;color:${T.mute};line-height:1.55;">
                  Fixfy Ltd — the partner network behind Fixfy home services.<br />
                  Questions? Reply to this email and a human will pick it up.
                </p>
                <p style="margin:10px 0 0;font-size:10px;color:${T.mute};letter-spacing:0.04em;">
                  © ${year} Fixfy Ltd · London, United Kingdom
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!resend) throw new Error("RESEND_API_KEY not set");
  const from = process.env.RESEND_FROM_EMAIL || "Fixfy Trade <onboarding@resend.dev>";
  await resend.emails.send({
    from,
    to,
    subject: `${code} is your Fixfy sign-in code`,
    html: otpEmailHtml(code),
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function newPartnerAdminHtml(p: { email: string; contactName: string; companyName: string; plan: string }): string {
  const year = new Date().getUTCFullYear();
  const logoUrl = `${absoluteAppUrl()}/logos/fixfy-primary-navy.png`;
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;font-size:12px;color:${T.mute};width:120px;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;font-size:14px;color:${T.ink};font-weight:600;">${esc(value)}</td>
    </tr>`;
  return `
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>New Fixfy Trade signup</title></head>
  <body style="margin:0;padding:0;background:${T.paper};font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;color:${T.ink};">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">New partner registered — review & activate.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.paper};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
          <tr><td style="background:#ffffff;padding:26px 28px 18px;border:1px solid ${T.line};border-bottom:none;border-radius:18px 18px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td><img src="${logoUrl}" alt="Fixfy" width="120" style="display:block;height:auto;max-width:120px;border:0;" /></td>
              <td align="right" style="font-family:'SFMono-Regular','Menlo',monospace;font-size:10px;font-weight:700;letter-spacing:0.24em;color:${T.mute};">NEW SIGNUP</td>
            </tr></table>
          </td></tr>
          <tr><td style="background:#ffffff;padding:32px 32px 26px;border-left:1px solid ${T.line};border-right:1px solid ${T.line};">
            <p style="margin:0 0 6px;font-family:'SFMono-Regular','Menlo',monospace;font-size:11px;font-weight:700;letter-spacing:0.18em;color:${T.coral};text-transform:uppercase;">New partner registered</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${T.navy};line-height:1.25;">${esc(p.companyName)}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${T.line};">
              ${row("Contact", p.contactName)}
              ${row("Email", p.email)}
              ${row("Plan", p.plan)}
            </table>
            <p style="margin:22px 0 0;font-size:13px;color:${T.slate};line-height:1.55;">
              They're in the portal now with <strong>restricted access</strong> until you approve them.
              Open <strong>Master OS → Partners</strong>, find this partner and hit <strong>Activate</strong> —
              that unlocks their account and emails them automatically.
            </p>
          </td></tr>
          <tr><td style="background:#ffffff;border:1px solid ${T.line};border-top:none;border-radius:0 0 18px 18px;padding:18px 32px 22px;">
            <p style="margin:0;font-size:10px;color:${T.mute};letter-spacing:0.04em;">© ${year} Fixfy Ltd · London, United Kingdom</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Notify the ops inbox that a new partner registered, so they can approve fast.
 * Fire-and-forget: callers should not block or roll back signup if this throws.
 */
export async function sendNewPartnerAdminNotification(p: {
  email: string;
  contactName: string;
  companyName: string;
  plan: string;
}): Promise<void> {
  if (!resend) throw new Error("RESEND_API_KEY not set");
  const from = process.env.RESEND_FROM_EMAIL || "Fixfy Trade <onboarding@resend.dev>";
  const to = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || "victor@getfixfy.com";
  await resend.emails.send({
    from,
    to,
    subject: `New Fixfy Trade signup — ${p.companyName}`,
    html: newPartnerAdminHtml(p),
  });
}
