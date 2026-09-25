"use client";

// Na /application-sent: pergunta os cookies (se ainda não respondeu) e, com o
// sim, manda o CompleteRegistration. O PageView desta URL é o que a conversão
// personalizada "Parceiro · Cadastro completo" conta.

import { useEffect } from "react";
import { MarketingConsent } from "@/components/consent/marketing-consent";
import { trackOnce } from "@/lib/meta-pixel";

export function ApplicationSentTracker() {
  useEffect(() => {
    trackOnce("CompleteRegistration");
  }, []);
  return <MarketingConsent onAccept={() => trackOnce("CompleteRegistration")} />;
}
