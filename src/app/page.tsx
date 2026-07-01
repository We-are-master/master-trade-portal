import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner-auth";
import { Providers } from "@/components/providers";
import { TradePortalApp } from "@/components/app";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    invite?: string;
    name?: string;
    business?: string;
    trades?: string;
    trade?: string;
    phone?: string;
  }>;
}) {
  const session = await getPartnerSession();
  const sp = await searchParams;

  if (!session) {
    const handoff = sp.name?.trim() || sp.business?.trim() || sp.trades?.trim() || sp.trade?.trim();
    if (handoff) {
      const params = new URLSearchParams();
      if (sp.name?.trim()) params.set("name", sp.name.trim());
      if (sp.email?.trim()) params.set("email", sp.email.trim());
      if (sp.business?.trim()) params.set("business", sp.business.trim());
      if (sp.phone?.trim()) params.set("phone", sp.phone.trim());
      const trades = sp.trades?.trim() || sp.trade?.trim();
      if (trades) params.set("trades", trades);
      redirect(`/get-started?${params.toString()}`);
    }

    const email = sp.email?.trim();
    const invite = sp.invite?.trim();
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (invite) params.set("invite", invite);
    const qs = params.toString();
    redirect(qs ? `/login?${qs}` : "/login");
  }

  return (
    <Providers partner={session.partner}>
      <TradePortalApp />
    </Providers>
  );
}
