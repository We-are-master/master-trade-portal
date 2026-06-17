"use client";

// TradePortalApp — root shell, client-side router, drawer + onboarding state.
// Ported from app.jsx. Navigation is internal state (faithful to the prototype);
// real URL routes can be layered on in a later phase.

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

  // Gate: a partner can only use the platform once their required documents are on file. Check on
  // load — if any are missing, force onboarding open and locked until they upload them. Re-run
  // after each document change inside onboarding to release the lock the moment they're complete.
  const checkDocs = useCallback(async () => {
    try {
      const [docs, reqJson] = await Promise.all([
        fetchPartnerDocuments(createClient(), partner.id),
        fetch("/api/partner/required-docs").then((r) => r.json()).catch(() => ({ required: [] })),
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
      setDocsLocked(missing.length > 0);
      if (missing.length > 0) setShowOnboarding(true);
    } catch {
      /* network hiccup — don't lock the user out on a transient error */
    }
  }, [partner.id]);

  // Fresh sign-ups land at /?welcome=1 — open onboarding straight away, then clean the URL so a
  // refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setShowOnboarding(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    void checkDocs();
  }, [checkDocs]);

  const [page, subpage] = route.split(":");

  const onNav = (id: string) => {
    setDrawerJobId(null);
    setRoute(id);
  };
  const handleOpenJob = (id: string) => setDrawerJobId(id);

  return (
    <div id="app-root" style={{ display: "flex", background: T.paper }}>
      <Sidebar active={page} onNav={onNav} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <TopBar
          title={TITLES[page]}
          breadcrumb={page === "settings" && subpage ? ["Settings", settingsPageLabel(subpage)] : []}
        />

        {page === "dashboard" && <Dashboard onOpenJob={handleOpenJob} onNav={onNav} />}
        {page === "leads" && <LeadsView onShowToast={toast} />}
        {page === "available" && <AvailableJobsView onShowToast={toast} />}
        {page === "quotes" && <AvailableQuotesView onShowToast={toast} />}
        {page === "jobs" && <MyJobsView onOpenJob={handleOpenJob} />}
        {page === "schedule" && <ScheduleView onOpenJob={handleOpenJob} />}
        {page === "settings" && <SettingsView initial={subpage || "profile"} />}
      </main>

      {drawerJobId && <JobDrawer jobId={drawerJobId} onClose={() => setDrawerJobId(null)} onShowToast={toast} />}

      {showOnboarding && (
        <Onboarding
          locked={docsLocked}
          onDocsChanged={checkDocs}
          onClose={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
