"use client";

// TradePortalApp — root shell, client-side router, drawer + onboarding state.

import { useCallback, useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { createClient } from "@/lib/supabase/client";
import { fetchPartnerDocuments } from "@/lib/queries/partner-documents";
import { missingFromChecklist } from "@/lib/partner-required-docs";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { Dashboard } from "@/components/screens/dashboard";
import { AvailableJobsView, AvailableQuotesView, LeadsView } from "@/components/screens/opportunities";
import { MyJobsView } from "@/components/screens/jobs";
import { JobDrawer } from "@/components/screens/job-drawer";
import { ScheduleView } from "@/components/screens/schedule";
import { SettingsView, settingsPageLabel } from "@/components/screens/settings";
import { Onboarding } from "@/components/screens/onboarding";
import { partnerSubscriptionLive, partnerWorkUnlocked } from "@/lib/partner-work-access";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  available: "Available jobs",
  quotes: "Available quotes",
  jobs: "My jobs",
  schedule: "Schedule",
  settings: "Settings",
};

export function TradePortalApp() {
  const [route, setRoute] = useState("dashboard");
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [docsLocked, setDocsLocked] = useState(false);
  const partner = usePartner();
  const toast = useToast();

  const checkDocs = useCallback(async () => {
    try {
      const [docs, reqJson, funnelJson] = await Promise.all([
        fetchPartnerDocuments(createClient(), partner.id),
        fetch("/api/partner/required-docs").then((r) => r.json()).catch(() => ({ required: [] })),
        fetch("/api/partner/funnel-complete").then((r) => r.json()).catch(() => ({ complete: false })),
      ]);
      const required = Array.isArray(reqJson?.required) ? reqJson.required : [];
      const docRows = docs.map((d) => ({
        id: d.id,
        name: d.name,
        doc_type: d.docType,
        status: d.status,
        created_at: new Date(0).toISOString(),
      }));
      const missing = missingFromChecklist(docRows, required);
      const locked = missing.length > 0;
      const funnelComplete = Boolean(funnelJson?.complete);
      setDocsLocked(locked);
      if (partner.status === "onboarding") {
        setShowOnboarding(!funnelComplete);
      }
    } catch {
      /* network hiccup — don't lock the user out on a transient error */
    }
  }, [partner.id, partner.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      void fetch("/api/partner/funnel-complete")
        .then((r) => r.json())
        .then((json) => {
          if (!json?.complete) setShowOnboarding(true);
        })
        .catch(() => setShowOnboarding(true));
      window.history.replaceState(null, "", window.location.pathname);
    } else if (partner.status === "onboarding") {
      void fetch("/api/partner/funnel-complete")
        .then((r) => r.json())
        .then((json) => {
          if (!json?.complete) setShowOnboarding(true);
        })
        .catch(() => setShowOnboarding(true));
    }
    void checkDocs();
  }, [checkDocs, partner.status]);

  useEffect(() => {
    if (partnerWorkUnlocked(partner) && partner.billingReady && !partnerSubscriptionLive(partner.subscriptionStatus)) {
      void fetch("/api/billing/activate-subscription", { method: "POST" });
    }
  }, [partner]);

  const workLocked = !partnerWorkUnlocked(partner);

  const [page, subpage] = route.split(":");

  const onNav = (id: string) => {
    setDrawerJobId(null);
    setRoute(id);
  };
  const handleOpenJob = (id: string) => setDrawerJobId(id);

  return (
    <div id="app-root" style={{ display: "flex", background: T.paper }}>
      <Sidebar active={page} onNav={onNav} workLocked={workLocked} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <TopBar
          title={TITLES[page]}
          breadcrumb={page === "settings" && subpage ? ["Settings", settingsPageLabel(subpage)] : []}
        />

        {page === "dashboard" && (
          <Dashboard previewMode={workLocked} redactSensitive={workLocked} onOpenJob={handleOpenJob} onNav={onNav} />
        )}
        {page === "leads" && (
          <LeadsView previewMode={workLocked} redactSensitive={workLocked} onShowToast={toast} />
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

      {drawerJobId && <JobDrawer jobId={drawerJobId} onClose={() => setDrawerJobId(null)} onShowToast={toast} />}

      {showOnboarding && (
        <Onboarding
          locked={docsLocked}
          onDocsChanged={checkDocs}
          onClose={() => {
            if (workLocked || docsLocked) return;
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}
