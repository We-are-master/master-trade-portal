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
import { AddPaymentMethodModal } from "@/components/billing/add-payment-method-modal";
import {
  partnerBillingEnabled,
  partnerSubscriptionLive,
  partnerWorkUnlocked,
} from "@/lib/partner-work-access";

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
  /** True right after the /get-started wizard finishes — shows the "under review" banner. */
  const [showReviewBanner, setShowReviewBanner] = useState(false);
  const partner = usePartner();
  const toast = useToast();

  /** Wizard is finished when we've stamped a completion timestamp or the partner is already promoted. */
  const wizardDone = !!partner.wizardCompletedAt || partner.status === "active";

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
      // Only re-open the in-portal onboarding modal while the wizard is still
      // incomplete. Once wizardCompletedAt is stamped (or the partner is
      // active) the modal never reopens — we surface a review banner instead.
      if (partner.status === "onboarding" && !wizardDone) {
        setShowOnboarding(!funnelComplete);
      }
    } catch {
      /* network hiccup — don't lock the user out on a transient error */
    }
  }, [partner.id, partner.status, wizardDone]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const submitted = params.get("submitted") === "1";
    const welcomeParam = params.get("welcome") === "1";
    if (submitted) {
      // Just landed from the wizard's success redirect — celebrate + tell
      // them we'll review + strip the query.
      setShowReviewBanner(true);
      setShowOnboarding(false);
      window.history.replaceState(null, "", window.location.pathname);
    } else if (welcomeParam) {
      if (!wizardDone) {
        void fetch("/api/partner/funnel-complete")
          .then((r) => r.json())
          .then((json) => {
            if (!json?.complete) setShowOnboarding(true);
          })
          .catch(() => setShowOnboarding(true));
      }
      window.history.replaceState(null, "", window.location.pathname);
    } else if (partner.status === "onboarding" && !wizardDone) {
      void fetch("/api/partner/funnel-complete")
        .then((r) => r.json())
        .then((json) => {
          if (!json?.complete) setShowOnboarding(true);
        })
        .catch(() => setShowOnboarding(true));
    }
    void checkDocs();
  }, [checkDocs, partner.status, wizardDone]);

  // Auto-start the Stripe subscription once the card is on file — but ONLY for
  // subscription-tier partners. Free / un-tiered accounts never touch billing.
  useEffect(() => {
    if (
      partnerBillingEnabled(partner) &&
      partnerWorkUnlocked(partner) &&
      partner.billingReady &&
      !partnerSubscriptionLive(partner.subscriptionStatus)
    ) {
      void fetch("/api/billing/activate-subscription", { method: "POST" });
    }
  }, [partner]);

  // Payment modal — shown to subscription partners who still need a card on
  // file (and whose subscription isn't already live). Dismissible so they can
  // browse first; it reappears next load until a card is saved.
  const needsPayment =
    partnerBillingEnabled(partner) &&
    !partner.billingReady &&
    !partnerSubscriptionLive(partner.subscriptionStatus);
  const [showPayModal, setShowPayModal] = useState(false);
  useEffect(() => {
    setShowPayModal(needsPayment);
  }, [needsPayment]);

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

      {showOnboarding && !wizardDone && (
        <Onboarding
          locked={docsLocked}
          onDocsChanged={checkDocs}
          onClose={() => {
            if (workLocked || docsLocked) return;
            setShowOnboarding(false);
          }}
        />
      )}

      {showReviewBanner && (
        <ReviewBanner onClose={() => setShowReviewBanner(false)} />
      )}

      {showPayModal && (
        <AddPaymentMethodModal
          open
          onClose={() => setShowPayModal(false)}
          onSaved={() => setShowPayModal(false)}
        />
      )}
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
          quotes and jobs unlock as soon as our team activates your account (usually within 1 business day).
          We&apos;ll email you the moment you&apos;re live.
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
