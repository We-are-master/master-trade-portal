import { redirect } from "next/navigation";

/** Legacy LP links: all new partners start at /get-started (free to join; a `plan` param is dropped). */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; email?: string; business?: string; trades?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["name", "email", "business", "trades"] as const) {
    const v = sp[key]?.trim();
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  redirect(qs ? `/get-started?${qs}` : "/get-started");
}
