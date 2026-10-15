"use client";

// TradePortalApp — root shell, client-side router, drawer state.
// Redesign 15/10/2026: quatro destinos (Today, Offers, My jobs, Money) e a
// conta no avatar. Rotas antigas (dashboard, available, quotes, schedule)
// continuam valendo pelos links de e-mail: normalizeRoute leva ao destino novo.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { OffersProvider } from "@/components/offers-context";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav, MoreSheet, BOTTOM_NAV_HEIGHT } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/topbar";
import { normalizeRoute, PAGE_TITLES } from "@/components/shell/nav-config";
import { TodayView } from "@/components/screens/today";
import { JobsHub, MoneyHub, OffersHub } from "@/components/screens/hubs";
import { JobDrawer } from "@/components/screens/job-drawer";
import { SettingsView } from "@/components/screens/settings";
import { partnerWorkUnlocked } from "@/lib/partner-work-access";
import { useIsMobile } from "@/hooks/use-media-query";
import { UnderReviewGate } from "@/components/under-review-gate";

export function TradePortalApp() {
  const partner = usePartner();
  const workLocked = !partnerWorkUnlocked(partner);
  // Still awaiting Master OS approval (not paused/deactivated).
  const pendingApproval = workLocked && partner.status !== "inactive" && partner.status !== "on_break";

  // New partners don't get into the platform until the OS activates them.
  if (pendingApproval) return <UnderReviewGate partnerId={partner.id} />;

  return (
    <OffersProvider paused={workLocked}>
      <PortalShell workLocked={workLocked} />
    </OffersProvider>
  );
}

function PortalShell({ workLocked }: { workLocked: boolean }) {
  const [route, setRoute] = useState("today");
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  /** Aba com que a gaveta abre (o link do report abre direto em "signoff"). */
  const [drawerTab, setDrawerTab] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const toast = useToast();
  const isMobile = useIsMobile();

  // Onboarding lives entirely in the /get-started wizard. Its success redirect
  // lands here with ?submitted=1; a partner still under review gets the
  // UnderReviewGate above, so the flag only needs clearing from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Link do e-mail da oferta: ?screen=opportunities abre direto nas ofertas.
    const tela = params.get("screen");
    if (tela && /^[a-z-]+(:[a-z-]+)?$/.test(tela)) setRoute(normalizeRoute(tela));
    // Link do report no e-mail: ?job=<id>&tab=report abre a gaveta do job na aba Report.
    const jobDoLink = params.get("job");
    if (jobDoLink && /^[0-9a-zA-Z-]{6,64}$/.test(jobDoLink)) {
      setDrawerJobId(jobDoLink);
      setDrawerTab(params.get("tab") === "report" ? "signoff" : null);
    }
    if (params.get("submitted") === "1" || params.get("welcome") === "1" || tela || jobDoLink) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const [page, subpage = ""] = route.split(":");

  const onNav = (id: string) => {
    setDrawerJobId(null);
    setAccountOpen(false);
    setRoute(normalizeRoute(id));
    // Each destination is its own screen on mobile — start it at the top.
    document.querySelector("#app-root main [data-screen-scroll]")?.scrollTo({ top: 0 });
  };
  const onSub = (s: string) => setRoute(`${page}:${s}`);
  const openJob = (id: string) => {
    setDrawerTab(null);
    setDrawerJobId(id);
  };
  const openReport = (id: string) => {
    setDrawerTab("signoff");
    setDrawerJobId(id);
  };

  return (
    <div
      id="app-root"
      className={isMobile ? "fx-mobile-shell" : undefined}
      style={{ display: "flex", background: T.paper }}
    >
      {!isMobile && <Sidebar active={page} onNav={onNav} />}

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
          // Room for the fixed tab bar plus the home indicator.
          paddingBottom: isMobile ? `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` : 0,
        }}
      >
        <TopBar title={PAGE_TITLES[page] ?? "Today"} onAccount={() => setAccountOpen(true)} />

        {page === "today" && (
          <TodayView
            previewMode={workLocked}
            redactSensitive={workLocked}
            onOpenJob={openJob}
            onOpenReport={openReport}
            onNav={onNav}
          />
        )}
        {page === "offers" && (
          <OffersHub sub={subpage} onSub={onSub} onShowToast={toast} previewMode={workLocked} redactSensitive={workLocked} />
        )}
        {page === "jobs" && (
          <JobsHub sub={subpage} onSub={onSub} onOpenJob={openJob} previewMode={workLocked} redactSensitive={workLocked} />
        )}
        {page === "money" && <MoneyHub sub={subpage} onSub={onSub} />}
        {page === "settings" && <SettingsView initial={subpage || "profile"} />}
      </main>

      {isMobile && <BottomNav active={page} onNav={onNav} />}
      {isMobile && accountOpen && (
        <MoreSheet active={page} onNav={onNav} onClose={() => setAccountOpen(false)} />
      )}

      {drawerJobId && (
        <JobDrawer
          jobId={drawerJobId}
          initialTab={drawerTab ?? undefined}
          onClose={() => {
            setDrawerJobId(null);
            setDrawerTab(null);
          }}
          onShowToast={toast}
        />
      )}
    </div>
  );
}
