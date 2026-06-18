"use client";

// TradePortalApp — root shell, client-side router, drawer + onboarding state.

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { AddPaymentMethodModal } from "@/components/billing/add-payment-method-modal";
import { ReviewLockOverlay } from "@/components/ui/review-lock-overlay";
import { Icon } from "@/components/ui/icon";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  available: "Available jobs",
  quotes: "Available quotes",
  jobs: "My jobs",
  schedule: "Schedule",
  settings: "Settings",
};

const WORK_PAGES = new Set(["leads", "available", "quotes", "jobs", "schedule"]);

function AccountReviewBanner() {
  return (
    <div
      style={{
        margin: "0 20px 12px",
        padding: "12px 14px",
        borderRadius: 10,
        background: T.amber50,
        border: `1px solid ${T.amber}`,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        fontSize: 13,
        lineHeight: 1.45,
        color: T.ink,
      }}
    >
      <Icon name="clock" size={16} color={T.amber} />
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Account in review</div>
        <div style={{ color: T.slate }}>
          Our team is reviewing your profile and documents. We&apos;ll email you when you&apos;re approved to receive jobs.
        </div>
      </div>
    </div>
  );
}

function withReviewLock(
  locked: boolean,
  pageLabel: string,
  onOpenSettings: () => void,
  view: ReactNode,
): ReactNode {
  if (!locked) return view;
  return (
    <ReviewLockOverlay pageLabel={pageLabel} onOpenSettings={onOpenSettings}>
      {view}
    </ReviewLockOverlay>
  );
}

export function TradePortalApp() {
  const [route, setRoute] = useState("dashboard");
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [docsLocked, setDocsLocked] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const partner = usePartner();
  const toast = useToast();

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
      const locked = missing.length > 0;
      setDocsLocked(locked);
      if (locked && partner.status === "onboarding") {
        setShowOnboarding(true);
      } else if (partner.status === "onboarding" && !locked) {
        setShowOnboarding(false);
      }
    } catch {
      /* network hiccup — don't lock the user out on a transient error */
    }
  }, [partner.id, partner.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setShowOnboarding(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (partner.status === "onboarding") setShowOnboarding(true);
    void checkDocs();
  }, [checkDocs, partner.status]);

  const needsPaymentMethod =
    partner.status === "active" &&
    !partner.billingReady &&
    partner.subscriptionStatus !== "active";

  useEffect(() => {
    if (needsPaymentMethod) setShowPaymentModal(true);
  }, [needsPaymentMethod]);

  useEffect(() => {
    if (partner.status === "active" && partner.billingReady && partner.subscriptionStatus !== "active") {
      void fetch("/api/billing/activate-subscription", { method: "POST" });
    }
  }, [partner.status, partner.billingReady, partner.subscriptionStatus]);

  const accountInReview = partner.status === "onboarding" && !docsLocked;
  const workLocked = accountInReview;

  const [page, subpage] = route.split(":");

  const onNav = (id: string) => {
    setDrawerJobId(null);
    setRoute(id);
  };
  const handleOpenJob = (id: string) => setDrawerJobId(id);
  const openSettings = () => setRoute("settings");

  const renderWorkPage = (id: string, view: ReactNode) =>
    withReviewLock(workLocked && WORK_PAGES.has(id), TITLES[id] ?? "This section", openSettings, view);

  return (
    <div id="app-root" style={{ display: "flex", background: T.paper }}>
      <Sidebar active={page} onNav={onNav} workLocked={workLocked} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <TopBar
          title={TITLES[page]}
          breadcrumb={page === "settings" && subpage ? ["Settings", settingsPageLabel(subpage)] : []}
        />

        {accountInReview && <AccountReviewBanner />}

        {page === "dashboard" &&
          withReviewLock(
            workLocked,
            "Dashboard",
            openSettings,
            <Dashboard previewMode={workLocked} onOpenJob={handleOpenJob} onNav={onNav} />,
          )}
        {page === "leads" && renderWorkPage("leads", <LeadsView previewMode={workLocked} onShowToast={toast} />)}
        {page === "available" && renderWorkPage("available", <AvailableJobsView previewMode={workLocked} onShowToast={toast} />)}
        {page === "quotes" && renderWorkPage("quotes", <AvailableQuotesView previewMode={workLocked} onShowToast={toast} />)}
        {page === "jobs" && renderWorkPage("jobs", <MyJobsView previewMode={workLocked} onOpenJob={handleOpenJob} />)}
        {page === "schedule" && renderWorkPage("schedule", <ScheduleView previewMode={workLocked} onOpenJob={handleOpenJob} />)}
        {page === "settings" && <SettingsView initial={subpage || "profile"} />}
      </main>

      {drawerJobId && <JobDrawer jobId={drawerJobId} onClose={() => setDrawerJobId(null)} onShowToast={toast} />}

      {showOnboarding && (
        <Onboarding
          locked={docsLocked}
          onDocsChanged={checkDocs}
          onClose={() => {
            if (accountInReview || docsLocked) return;
            setShowOnboarding(false);
          }}
        />
      )}

      <AddPaymentMethodModal
        open={showPaymentModal}
        blocking={needsPaymentMethod}
        onClose={() => setShowPaymentModal(false)}
        onSaved={() => {
          setShowPaymentModal(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
