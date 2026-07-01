import { redirect } from "next/navigation";

/** Legacy LP links — all new partners start at /get-started (7-day trial, no card). */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; name?: string; email?: string; business?: string; trades?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["plan", "name", "email", "business", "trades"] as const) {
    const v = sp[key]?.trim();
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  redirect(qs ? `/get-started?${qs}` : "/get-started");
}
