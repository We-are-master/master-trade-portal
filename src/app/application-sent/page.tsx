// /application-sent: onde o /get-started termina. Endereço próprio para a Meta
// medir "cadastro completo" por URL (conversão personalizada), sem misturar com
// a home do portal, que parceiro logado abre todo dia. Mostra o mesmo portal da
// home: quem ainda está em análise vê o vídeo "Working with Fixfy".

import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner-auth";
import { Providers } from "@/components/providers";
import { TradePortalApp } from "@/components/app";
import { ApplicationSentTracker } from "@/components/consent/application-sent-tracker";

export default async function ApplicationSentPage() {
  const session = await getPartnerSession();
  if (!session) redirect("/login");

  return (
    <Providers partner={session.partner}>
      <TradePortalApp />
      <ApplicationSentTracker />
    </Providers>
  );
}
