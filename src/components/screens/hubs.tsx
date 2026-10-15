"use client";

// Os três destinos que juntam telas que já existiam (redesign 15/10/2026):
// Offers = jobs disponíveis + cotações, My jobs = lista + calendário,
// Money = pagamentos + documentos. Cada um troca a sub-aba pelo trilho do topo.

import { T } from "@/lib/tokens";
import { USegmented } from "@/components/ui/uno";
import { useOffers } from "@/components/offers-context";
import { useIsMobile } from "@/hooks/use-media-query";
import { AvailableJobsView, AvailableQuotesView } from "./opportunities";
import { MyJobsView } from "./jobs";
import { ScheduleView } from "./schedule";
import { DocsPage, SelfBillPage } from "./settings";
import type { useToast } from "@/components/ui/toast";

type Toast = ReturnType<typeof useToast>;

export function OffersHub({
  sub,
  onSub,
  onShowToast,
  previewMode,
  redactSensitive,
}: {
  sub: string;
  onSub: (s: string) => void;
  onShowToast: Toast;
  previewMode: boolean;
  redactSensitive: boolean;
}) {
  const offers = useOffers();
  const tab = sub === "quotes" ? "quotes" : "jobs";
  const rail = (
    <USegmented
      label="Offer type"
      help={tab === "quotes" ? "Requests requiring your pricing. Track quotes from submission to outcome." : "Available jobs with a defined scope and pay. Review an offer before accepting."}
      value={tab}
      onChange={onSub}
      options={[
        { id: "jobs", label: offers.loaded ? `Jobs · ${offers.jobs.length}` : "Jobs" },
        { id: "quotes", label: offers.loaded ? `Quotes · ${offers.quotes.length}` : "Quotes" },
      ]}
    />
  );
  // As telas de dentro mudam a oferta (aceitar, recusar, cotar): o contador acompanha.
  const toast: Toast = (...args: Parameters<Toast>) => {
    offers.refresh();
    return onShowToast(...args);
  };
  return tab === "quotes" ? (
    <AvailableQuotesView title="Offers" topSlot={rail} onShowToast={toast} previewMode={previewMode} redactSensitive={redactSensitive} />
  ) : (
    <AvailableJobsView title="Offers" topSlot={rail} onShowToast={toast} previewMode={previewMode} redactSensitive={redactSensitive} />
  );
}

export function JobsHub({
  sub,
  onSub,
  onOpenJob,
  previewMode,
  redactSensitive,
}: {
  sub: string;
  onSub: (s: string) => void;
  onOpenJob: (id: string) => void;
  previewMode: boolean;
  redactSensitive: boolean;
}) {
  const tab = sub === "calendar" ? "calendar" : "list";
  const rail = (
    <USegmented
      label="Jobs view"
      help={tab === "calendar" ? "Your scheduled jobs arranged by date." : "Your assigned jobs and their current status."}
      value={tab}
      onChange={onSub}
      options={[
        { id: "list", label: "Jobs" },
        { id: "calendar", label: "Calendar" },
      ]}
    />
  );
  return tab === "calendar" ? (
    <ScheduleView title="My jobs" topSlot={rail} onOpenJob={onOpenJob} previewMode={previewMode} redactSensitive={redactSensitive} />
  ) : (
    <MyJobsView topSlot={rail} defaultView="list" onOpenJob={onOpenJob} previewMode={previewMode} redactSensitive={redactSensitive} />
  );
}

export function MoneyHub({ sub, onSub }: { sub: string; onSub: (s: string) => void }) {
  const isMobile = useIsMobile();
  const tab = sub === "docs" ? "docs" : "payouts";
  return (
    <div data-screen-scroll style={{ flex: 1, overflow: "auto", padding: isMobile ? 16 : "20px 24px 56px", fontFamily: T.sans }}>
      <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 16 }}>
        <USegmented
          label="Payments"
          help={tab === "docs" ? "Insurance, certificates and agreements required to work with Fixfy." : "Your payment details, payout statements and commission invoices."}
          value={tab}
          onChange={onSub}
          options={[
            { id: "payouts", label: "Payouts" },
            { id: "docs", label: "Documents" },
          ]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{tab === "docs" ? <DocsPage /> : <SelfBillPage />}</div>
      </div>
    </div>
  );
}
