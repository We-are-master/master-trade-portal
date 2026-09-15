import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner-auth";
import { partnerWorkUnlocked } from "@/lib/partner-work-access";

/** Keep activated partners out of the funnel; they belong in the portal. */
export default async function GetStartedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPartnerSession();
  if (session && partnerWorkUnlocked(session.partner)) {
    redirect("/");
  }
  return children;
}
