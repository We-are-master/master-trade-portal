"use client";

// TradePortalApp — root shell, client-side router, drawer state.

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { useToast } from "@/components/ui/toast";
import { usePartner } from "@/components/partner-context";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { Dashboard } from "@/components/screens/dashboard";
import { AvailableJobsView, AvailableQuotesView } from "@/components/screens/opportunities";
import { MyJobsView } from "@/components/screens/jobs";
import { JobDrawer } from "@/components/screens/job-drawer";
import { ScheduleView } from "@/components/screens/schedule";
import { SettingsView, settingsPageLabel } from "@/components/screens/settings";
import { Icon } from "@/components/ui/primitives";
import { partnerWorkUnlocked } from "@/lib/partner-work-access";

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
  /** True right after the /get-started wizard finishes — shows the "under review" banner. */
  const [showReviewBanner, setShowReviewBanner] = useState(false);
  const partner = usePartner();
  const toast = useToast();

  // Onboarding lives entirely in the /get-started wizard now. The old in-portal
  // onboarding modal is gone — a partner who lands here has already finished
  // (or is browsing while under review). We only surface the review banner
  // when they arrive from the wizard's success redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("submitted") === "1" || params.get("welcome") === "1") {
      setShowReviewBanner(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const workLocked = !partnerWorkUnlocked(partner);
  // Still awaiting Master OS approval (not paused/deactivated).
  const pendingApproval = workLocked && partner.status !== "inactive" && partner.status !== "on_break";

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

        {pendingApproval && <PendingApprovalBanner />}

        {page === "dashboard" && (
          <Dashboard previewMode={workLocked} redactSensitive={workLocked} onOpenJob={handleOpenJob} onNav={onNav} />
        )}
        {page === "leads" && <HotLeadsComingSoon />}
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

      {showReviewBanner && (
        <ReviewBanner onClose={() => setShowReviewBanner(false)} />
      )}
    </div>
  );
}

function HotLeadsComingSoon() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: T.sans,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: T.coralTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon name="user-plus" size={24} color={T.coral} />
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: T.coral,
          marginBottom: 8,
        }}
      >
        Soon
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.navy, letterSpacing: "-0.02em" }}>
        Hot Leads
      </h2>
      <p style={{ margin: "10px 0 0", maxWidth: 360, fontSize: 14, color: T.slate, lineHeight: 1.55 }}>
        Direct customer enquiries are on the way. For now, pick up work from Available Jobs and Available Quotes —
        same access for every active partner.
      </p>
    </div>
  );
}

/** Persistent, non-dismissible bar shown while the account is awaiting approval. */
function PendingApprovalBanner() {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: T.coralTint,
        borderBottom: "1px solid rgba(237,75,0,0.18)",
        padding: "12px 20px",
        fontFamily: T.sans,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: "20px", flex: "none" }} aria-hidden>
        ⏳
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.navy, letterSpacing: "-0.01em" }}>
          Account under review — usually approved within 24–48 hours
        </div>
        <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.5, marginTop: 2 }}>
          You can explore the portal now. Jobs &amp; quotes open the moment we activate you — we&apos;ll
          email you as soon as you&apos;re live.
        </div>
      </div>
    </div>
  );
}

function ReviewBanner({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,0,64,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 950,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          background: T.white,
          borderRadius: 20,
          boxShadow: "0 30px 80px -20px rgba(2,0,64,0.6)",
          padding: "36px 32px 28px",
          textAlign: "center",
          fontFamily: T.sans,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: T.coralTint,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            fontSize: 28,
          }}
          aria-hidden
        >
          🎉
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.navy, letterSpacing: "-0.02em" }}>
          Application submitted
        </h2>
        <p style={{ margin: "12px 0 20px", fontSize: 14, color: T.slate, lineHeight: 1.55 }}>
          Thanks — we&apos;re reviewing your onboarding now. You can explore the portal in the meantime; leads,
          quotes and jobs unlock as soon as our team activates your account (new accounts are usually approved
          within 24–48 hours). We&apos;ll email you the moment you&apos;re live.
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: T.coral,
            color: T.white,
            fontFamily: T.sans,
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 22px",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          Explore the portal
        </button>
      </div>
    </div>
  );
}
