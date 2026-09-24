"use client";

// TradePortalApp — root shell, client-side router, drawer state.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav, MoreSheet, BOTTOM_NAV_HEIGHT } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/topbar";
import { Dashboard } from "@/components/screens/dashboard";
import { AvailableJobsView, AvailableQuotesView } from "@/components/screens/opportunities";
import { MyJobsView } from "@/components/screens/jobs";
import { JobDrawer } from "@/components/screens/job-drawer";
import { ScheduleView } from "@/components/screens/schedule";
import { SettingsView, settingsPageLabel } from "@/components/screens/settings";
import { Icon } from "@/components/ui/primitives";
import { partnerWorkUnlocked } from "@/lib/partner-work-access";
import { useIsMobile } from "@/hooks/use-media-query";
import { UnderReviewGate } from "@/components/under-review-gate";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  available: "Available jobs",
  quotes: "Available quotes",
  jobs: "My jobs",
  schedule: "Schedule",
  settings: "Settings",
};

export function TradePortalApp() {
  const [route, setRoute] = useState("dashboard");
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const partner = usePartner();
  const toast = useToast();
  const isMobile = useIsMobile();

  // Onboarding lives entirely in the /get-started wizard. Its success redirect
  // lands here with ?submitted=1; a partner still under review gets the
  // UnderReviewGate below, so the flag only needs clearing from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("submitted") === "1" || params.get("welcome") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const workLocked = !partnerWorkUnlocked(partner);
  // Still awaiting Master OS approval (not paused/deactivated).
  const pendingApproval = workLocked && partner.status !== "inactive" && partner.status !== "on_break";

  const [page, subpage] = route.split(":");

  const onNav = (id: string) => {
    setDrawerJobId(null);
    setMoreOpen(false);
    setRoute(id);
    // Each destination is its own screen on mobile — start it at the top.
    document.querySelector("#app-root main [data-screen-scroll]")?.scrollTo({ top: 0 });
  };
  const handleOpenJob = (id: string) => setDrawerJobId(id);

  // New partners don't get into the platform until the OS activates them.
  if (pendingApproval) return <UnderReviewGate partnerId={partner.id} />;

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
        <TopBar
          title={TITLES[page]}
          breadcrumb={page === "settings" && subpage ? ["Settings", settingsPageLabel(subpage)] : []}
          onMore={() => setMoreOpen(true)}
        />

        {page === "dashboard" && (
          <Dashboard previewMode={workLocked} redactSensitive={workLocked} onOpenJob={handleOpenJob} onNav={onNav} />
        )}
        {page === "available" && (
          <AvailableJobsView previewMode={workLocked} redactSensitive={workLocked} onShowToast={toast} />
        )}
        {page === "quotes" && (
          <AvailableQuotesView previewMode={workLocked} redactSensitive={workLocked} onShowToast={toast} />
        )}
        {page === "jobs" && (
          <MyJobsView previewMode={workLocked} redactSensitive={workLocked} onOpenJob={handleOpenJob} />
        )}
        {page === "schedule" && (
          <ScheduleView previewMode={workLocked} redactSensitive={workLocked} onOpenJob={handleOpenJob} />
        )}
        {page === "settings" && <SettingsView initial={subpage || "profile"} />}
      </main>

      {isMobile && <BottomNav active={page} onNav={onNav} />}
      {isMobile && moreOpen && (
        <MoreSheet active={page} onNav={onNav} onClose={() => setMoreOpen(false)} />
      )}

      {drawerJobId && <JobDrawer jobId={drawerJobId} onClose={() => setDrawerJobId(null)} onShowToast={toast} />}

    </div>
  );
}
