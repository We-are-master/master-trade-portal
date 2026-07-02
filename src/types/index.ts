// Domain types for the Fixfy Trade Portal.
//
// These are shaped to mirror the Fixfy OS (master-os) Supabase structure so the
// UI built against mock data can be wired to the real database with minimal change.
// DB-mapping notes are inline; see src/lib/supabase/README for the wiring plan.

// Trades are now driven by the OS service_catalog (the partner picks the actual
// services we offer), so this is an open string rather than a fixed union.
export type Trade = string;

// master-os: jobs.status (aligned with the OS lifecycle)
export type JobStatus = "scheduled" | "in_progress" | "final_check" | "completed" | "cancelled";

// Where a job originated. master-os: jobs.source / derived from request|quote linkage.
export type JobSource = "job" | "lead" | "quote";

export type ScheduleStatus = JobStatus | "block";

// master-os: partners (the authenticated trade). "Marcus" seed maps here.
export interface Partner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  initials: string;
  avatarBg: string;
  avatarUrl?: string | null;
  trades: Trade[];
  primaryTrade: Trade;
  postcode: string;
  radiusMiles: number;
  excludedPostcodes?: string[];
  tradingName: string;
  trialDaysLeft: number;
  trialEndsOn: string;
  yearsExperience: number;
  bio: string;
  rating: number;
  ratingsCount: number;
  /** OS partners.status — onboarding = account in review until staff activates. */
  status: string;
  plan: string;
  billingReady: boolean;
  subscriptionStatus: string | null;
  /** ISO timestamp set when the /get-started wizard finishes. Null while the wizard is still in progress. */
  wizardCompletedAt?: string | null;
  /** `subscription` = billed via Stripe · `free` = ops-managed free tier · null = admin has not tiered them yet. */
  accountType?: "subscription" | "free" | null;
}

// master-os: clients / contacts on a job.
export interface Customer {
  id: string;
  name: string;
  initials: string;
  priorJobs: number;
  address: string;
  postcode: string;
}

// master-os: service_requests not yet quoted (lead-distribution concept — max 5 trades contact).
export interface Lead {
  id: string;
  title: string;
  desc: string;
  trade: Trade;
  emergency: boolean;
  postcode: string;
  distance: number;
  budgetMin: number;
  budgetMax: number;
  timing: string;
  customer: string;
  contactedCount: number;
  contactedMax: number;
  posted: string;
  winnable?: boolean;
  hot?: boolean;
  closed?: boolean;
}

// master-os: jobs that are quoted + customer-signed-off, open to first trade to accept.
export interface AvailableJob {
  id: string; // real jobs.id (uuid) — used to accept the offer
  reference?: string; // human-facing code (jobs.reference)
  title: string;
  desc: string;
  trade: Trade;
  emergency: boolean;
  postcode: string;
  distance: number;
  duration: string;
  total: number;
  timing: string;
}

export type QuoteRequestStatus = "to-quote" | "submitted" | "won" | "lost";

// master-os: quotes (quote_type = 'partner') / partner bids.
export interface QuoteRequest {
  id: string; // real quotes.id (uuid) — used to submit a bid
  reference?: string; // human-facing code (quotes.reference)
  title: string;
  desc: string;
  trades: Trade[];
  serviceType?: string;
  propertyAddress?: string;
  postcode: string;
  distance: number;
  deadline: string;
  status: QuoteRequestStatus;
  yourBid?: number;
  /** Raw `quote_bids.notes` for this partner — used to pre-fill update bid modal. */
  myBidNotes?: string;
  awardedAmount?: number;
}

// master-os: jobs assigned to this partner (partner_id).
export interface MyJob {
  id: string; // display id (reference, falls back to uuid)
  uuid: string; // real jobs.id (uuid) — for child queries (checklist, photos)
  source: JobSource;
  title: string;
  desc: string;
  trade: Trade;
  customer: Customer;
  postcode: string;
  distance: number;
  status: JobStatus;
  startedAt?: string;
  scheduled?: string;
  scheduledDate?: string; // raw ISO date (YYYY-MM-DD) for filtering/sorting
  scheduledStartAt?: string; // raw ISO timestamp for calendar placement
  scheduledEndAt?: string; // raw ISO timestamp for calendar placement
  /** Formatted visit start day (from scheduled_date). */
  scheduleStartLabel?: string;
  /** Formatted expected finish day (from scheduled_finish_date). */
  scheduleFinishLabel?: string;
  /** Arrival window label, e.g. 09:30–11:30. */
  scheduleArrivalLabel?: string;
  /** master-os: jobs.job_type — fixed price vs hourly. */
  pricingMode?: "fixed" | "hourly";
  inCcz?: boolean;
  hasFreeParking?: boolean;
  lat?: number; // jobs.latitude (geocoded)
  lng?: number; // jobs.longitude (geocoded)
  completed?: string;
  completedDate?: string; // raw ISO date (YYYY-MM-DD) for KPI windows
  durationEst: string;
  total: number;
  labour: number;
  materials: number;
  vat: boolean;
  progress?: number;
  checklistDone: number;
  checklistTotal: number;
  beforePhotos: number;
  afterPhotos: number;
  notesAdded?: boolean;
  notes?: string; // jobs.report_notes (customer-facing work notes)
  internalNotesText?: string; // jobs.internal_notes
  referencePhotos?: string[]; // jobs.images — site reference photos (read-only)
  signed?: boolean;
  elapsed?: string;
  accessNotes?: string;
  parkingNotes?: string;
  signoffLink?: string;
  rating?: number;
  ratingComment?: string;
  selfBillOn?: string;
  /** Raw jobs.status from OS (before portal board mapping). */
  osStatus: string;
  /** Job is on hold and needs partner action. */
  needsAttention: boolean;
  onHoldPresetId?: string;
  onHoldReason?: string;
  onHoldComplaintDescription?: string;
  onHoldAt?: string;
  /** Set when partner submitted on-hold response via portal or email link. */
  onHoldSubmissionAt?: string;
  /** Human label for on-hold preset (e.g. Complaint, Access issue). */
  onHoldLabel?: string;
}

export type ActivityTone = "coral" | "amber" | "green" | "navy";

export interface ActivityItem {
  id: string;
  type: string;
  when: string;
  icon: string;
  tone: ActivityTone;
  text: string;
  meta?: string;
}

export interface ScheduleEvent {
  day: number;
  start: string;
  end: string;
  title: string;
  status: ScheduleStatus;
  customer: string;
  jobId: string;
}

export interface ChecklistItem {
  id: number;
  label: string;
  done: boolean;
  required: boolean;
  note?: string;
}

export interface Kpis {
  thisWeek: { value: number; delta: string; trend: number[] };
  newLeads: { value: number; delta: string };
  available: { value: number; delta: string };
  active: { value: number; delta: string };
}
