// Server-only: does the email's domain receive mail (MX record)? Catches
// "someone@asdkjh.co.uk" that passes the format check. A DNS hiccup never
// blocks a signup: only a domain that clearly has no mail setup fails.

import { resolveMx } from "node:dns/promises";

const TIMEOUT_MS = 3000;

export async function emailDomainReceivesMail(email: string): Promise<boolean> {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (records === null) return true; // slow DNS: let it through
    return records.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Domain doesn't exist / has no MX: not a real inbox.
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return true;
  }
}
