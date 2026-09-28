// Email and phone checks for the /get-started details step. Anything typed there
// used to land in the OS as a lead, so "asdf@asdf.com" and "07000000000" came
// through. Pure functions: the step shows the message under the field, and
// /api/partner/onboarding-draft runs the same checks (plus the MX lookup in
// email-domain-check.ts) before the partner shows in Onboarding.

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Placeholder / made-up domains people type to get past a form. */
const FAKE_DOMAINS = new Set([
  "example.com",
  "example.co.uk",
  "example.org",
  "test.com",
  "test.co.uk",
  "testing.com",
  "fake.com",
  "fakeemail.com",
  "none.com",
  "noemail.com",
  "nomail.com",
  "no.com",
  "asdf.com",
  "abc.com",
  "xyz.com",
  "domain.com",
  "company.com",
  "company.co.uk",
]);

/** Throwaway inboxes: never a real business contact. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "tempmail.net",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "throwawaymail.com",
  "mintemail.com",
  "emailondeck.com",
]);

/** Common typos of the big providers → the right domain. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.co.uk": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmial.co.uk": "hotmail.co.uk",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "yahoo.co": "yahoo.co.uk",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
};

/** The email with a mistyped provider fixed (gmial.com → gmail.com), or null. */
export function suggestedEmail(raw: string): string | null {
  const [local, domain] = raw.trim().toLowerCase().split("@");
  const fix = domain ? DOMAIN_TYPOS[domain] : undefined;
  return local && fix ? `${local}@${fix}` : null;
}

/** Why this email can't be used, or null when it looks right. */
export function emailProblem(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return "Enter your email.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email, like you@company.co.uk.";
  const domain = email.split("@")[1];
  const fix = suggestedEmail(email);
  if (fix) return `Did you mean ${fix}?`;
  if (FAKE_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(domain)) {
    return "Use the email you actually check. We send your jobs there.";
  }
  return null;
}

/**
 * UK number in national form (0 + 10 digits), or null. Accepts spaces, dashes,
 * brackets and +44 / 0044. Mobiles 071–075 and 077–079, landlines 01 / 02 and
 * 03 numbers; 070 (personal), 076 (pagers), 08 / 09 (premium) are refused.
 */
export function normalizeUkPhone(raw: string): string | null {
  let d = raw.replace(/[\s\-().]/g, "");
  if (d.startsWith("+44")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0044")) d = `0${d.slice(4)}`;
  else if (d.startsWith("44") && d.length === 12) d = `0${d.slice(2)}`;
  if (d.startsWith("00")) d = d.slice(1); // +44 (0)7… written with the trunk zero
  if (!/^0\d{10}$/.test(d)) return null;
  if (!/^0(7[1-57-9]|1|2|3)/.test(d)) return null;
  return d;
}

/** Why this phone can't be used, or null when it looks right. */
export function phoneProblem(raw: string): string | null {
  if (!raw.trim()) return "Enter your mobile number.";
  const d = normalizeUkPhone(raw);
  if (!d) return "Enter a UK mobile or landline, like 07XXX XXXXXX.";
  const tail = d.slice(4);
  // Made-up numbers: 07000000000, 07777777777, 07123456789…
  if (/^(\d)\1+$/.test(tail) || /1234567|2345678|3456789|9876543|8765432|7654321/.test(d.slice(2))) {
    return "That number doesn't look real. Enter the one we can call you on.";
  }
  return null;
}
