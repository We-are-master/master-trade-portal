/**
 * Fixtures for {@link DEMO_ENABLED demo mode}. Nothing here touches Supabase.
 *
 * Dates are generated relative to today so the demo never looks stale: jobs sit
 * in this week, earnings land inside the running pay period, and the closed
 * fortnight is the one that just ended.
 */

import type { AvailableJob, MyJob, Partner, QuoteRequest } from "@/types";
import type { PartnerDoc } from "@/lib/queries/partner-documents";
import type { SelfBill } from "@/lib/queries/self-bills";
import type { PayPeriodRow } from "@/lib/queries/pay-periods";
import { addDays, fortnightWindow, payRunDateFor } from "@/lib/pay-period";
import { londonYmd } from "@/lib/date-range-filter";

const TODAY = () => londonYmd();

function ymd(offsetDays: number): string {
  return addDays(TODAY(), offsetDays);
}

function at(offsetDays: number, hhmm: string): string {
  return `${ymd(offsetDays)}T${hhmm}:00`;
}

function dayLabel(offsetDays: number): string {
  return new Date(`${ymd(offsetDays)}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const DEMO_PARTNER: Partner = {
  id: "demo-partner",
  firstName: "Alex",
  lastName: "Morgan",
  email: "alex@morganmaintenance.co.uk",
  phone: "07700 900142",
  initials: "AM",
  avatarBg: "#ED4B00",
  avatarUrl: null,
  trades: ["Plumbing", "General Maintenance", "Electrical"],
  primaryTrade: "Plumbing",
  postcode: "EC1V 2NX",
  radiusMiles: 15,
  excludedPostcodes: [],
  tradingName: "Morgan Maintenance Ltd",
  trialDaysLeft: 0,
  trialEndsOn: "",
  yearsExperience: 12,
  bio: "Gas Safe registered plumber covering central and east London. Twelve years on domestic and commercial maintenance.",
  rating: 4.8,
  ratingsCount: 63,
  status: "active",
  plan: "pro",
  billingReady: true,
  subscriptionStatus: "active",
  wizardCompletedAt: `${ymd(-180)}T10:00:00Z`,
  accountType: "subscription",
};

function customer(name: string, address: string, postcode: string, priorJobs: number) {
  return {
    id: `demo-cust-${postcode.replace(/\s/g, "").toLowerCase()}`,
    name,
    initials: name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    priorJobs,
    address,
    postcode,
  };
}

function job(partial: Partial<MyJob> & Pick<MyJob, "id" | "title" | "status" | "osStatus" | "total">): MyJob {
  const base: Omit<MyJob, "id" | "title" | "status" | "osStatus" | "total"> = {
    uuid: `uuid-${partial.id}`,
    source: "job",
    desc: "",
    trade: "Plumbing",
    customer: customer("Demo Client", "1 Demo Street, London", "EC1V 2NX", 1),
    postcode: "EC1V 2NX",
    distance: 3.2,
    durationEst: "2h",
    labour: partial.total * 0.7,
    materials: partial.total * 0.3,
    vat: true,
    checklistDone: 0,
    checklistTotal: 0,
    beforePhotos: 0,
    afterPhotos: 0,
    needsAttention: false,
  };
  return { ...base, ...partial };
}

export const DEMO_JOBS: MyJob[] = [
  job({
    id: "JOB-4821",
    title: "Leaking mixer tap — kitchen",
    desc: "Cold feed dripping steadily. Isolate, replace cartridge, test.",
    status: "in_progress",
    osStatus: "in_progress",
    trade: "Plumbing",
    customer: customer("Priya Raman", "14 Shoreditch High St, London", "E1 6PJ", 3),
    postcode: "E1 6PJ",
    distance: 1.8,
    total: 180,
    scheduled: `${dayLabel(0)} · 09:30`,
    scheduledDate: ymd(0),
    scheduledStartAt: at(0, "09:30"),
    scheduledEndAt: at(0, "11:30"),
    scheduleArrivalLabel: "09:30–11:30",
    startedAt: at(0, "09:34"),
    checklistDone: 2,
    checklistTotal: 4,
    beforePhotos: 3,
    progress: 50,
  }),
  job({
    id: "JOB-4830",
    source: "quote",
    title: "Consumer unit inspection",
    desc: "Annual EICR on a two-bed flat. Certificate issued on completion.",
    status: "scheduled",
    osStatus: "scheduled",
    trade: "Electrical",
    customer: customer("Tom Whitfield", "9 Clerkenwell Rd, London", "EC1M 5PA", 1),
    postcode: "EC1M 5PA",
    distance: 2.4,
    total: 320,
    scheduled: `${dayLabel(1)} · 08:00`,
    scheduledDate: ymd(1),
    scheduledStartAt: at(1, "08:00"),
    scheduledEndAt: at(1, "12:00"),
    scheduleArrivalLabel: "08:00–10:00",
    durationEst: "4h",
  }),
  job({
    id: "JOB-4834",
    title: "Radiator swap — first floor",
    desc: "Remove old panel radiator, fit customer-supplied replacement.",
    status: "scheduled",
    osStatus: "scheduled",
    trade: "Plumbing",
    customer: customer("Nadia Cole", "22 Bethnal Green Rd, London", "E2 6AH", 0),
    postcode: "E2 6AH",
    distance: 4.1,
    total: 240,
    scheduled: `${dayLabel(3)} · 13:00`,
    scheduledDate: ymd(3),
    scheduledStartAt: at(3, "13:00"),
    scheduledEndAt: at(3, "15:30"),
    scheduleArrivalLabel: "13:00–15:00",
  }),
  job({
    id: "JOB-4802",
    title: "Blocked shower waste",
    desc: "Cleared trap and stack branch. Flow tested.",
    status: "final_check",
    osStatus: "final_check",
    trade: "Plumbing",
    customer: customer("Dan Osei", "5 Hoxton Sq, London", "N1 6NU", 2),
    postcode: "N1 6NU",
    distance: 2.0,
    total: 150,
    completed: dayLabel(-2),
    completedDate: ymd(-2),
    checklistDone: 3,
    checklistTotal: 3,
    beforePhotos: 2,
    afterPhotos: 2,
    signed: true,
  }),
  job({
    id: "JOB-4788",
    title: "Boiler service — annual",
    desc: "Full service, flue gas analysis, landlord certificate.",
    status: "completed",
    osStatus: "completed",
    trade: "Plumbing",
    customer: customer("Helena Brooks", "40 Old St, London", "EC1V 9AE", 5),
    postcode: "EC1V 9AE",
    distance: 1.1,
    total: 210,
    completed: dayLabel(-4),
    completedDate: ymd(-4),
    checklistDone: 5,
    checklistTotal: 5,
    beforePhotos: 2,
    afterPhotos: 4,
    signed: true,
    rating: 5,
    ratingComment: "On time, tidy, explained everything. Would book again.",
  }),
  job({
    id: "JOB-4771",
    title: "Replace outdoor tap",
    desc: "Frost-proof bib tap fitted with isolation valve.",
    status: "completed",
    osStatus: "completed",
    trade: "Plumbing",
    customer: customer("Marcus Reid", "77 City Rd, London", "EC1Y 1BD", 1),
    postcode: "EC1Y 1BD",
    distance: 3.6,
    total: 165,
    completed: dayLabel(-6),
    completedDate: ymd(-6),
    checklistDone: 3,
    checklistTotal: 3,
    afterPhotos: 2,
    signed: true,
    rating: 5,
  }),
  job({
    id: "JOB-4756",
    title: "Kitchen sink re-seal",
    desc: "Stripped old sealant, re-bedded sink, silicone finish.",
    status: "completed",
    osStatus: "completed",
    trade: "General Maintenance",
    customer: customer("Sofia Lindqvist", "3 Curtain Rd, London", "EC2A 3AR", 4),
    postcode: "EC2A 3AR",
    distance: 2.2,
    total: 120,
    completed: dayLabel(-9),
    completedDate: ymd(-9),
    checklistDone: 2,
    checklistTotal: 2,
    signed: true,
    rating: 4,
  }),
  job({
    id: "JOB-4740",
    source: "lead",
    title: "Emergency stopcock replacement",
    desc: "Seized stopcock swapped under isolation. No mess left behind.",
    status: "completed",
    osStatus: "completed",
    trade: "Plumbing",
    customer: customer("Owen Baptiste", "18 Rivington St, London", "EC2A 3DU", 2),
    postcode: "EC2A 3DU",
    distance: 2.9,
    total: 295,
    completed: dayLabel(-12),
    completedDate: ymd(-12),
    checklistDone: 4,
    checklistTotal: 4,
    signed: true,
    rating: 5,
  }),
];

export const DEMO_AVAILABLE_JOBS: AvailableJob[] = [
  {
    id: "demo-avail-1",
    reference: "JOB-4901",
    title: "No hot water — combi boiler",
    desc: "Tenant reports no hot water since this morning. Heating still works.",
    trade: "Plumbing",
    emergency: true,
    postcode: "E1 6AN",
    distance: 2.1,
    duration: "2h",
    total: 260,
    timing: "Today, ASAP",
  },
  {
    id: "demo-avail-2",
    reference: "JOB-4903",
    title: "Fit two bathroom extractor fans",
    desc: "Replace like-for-like in a two-bathroom flat. Access arranged.",
    trade: "Electrical",
    emergency: false,
    postcode: "N1 7ED",
    distance: 3.4,
    duration: "3h",
    total: 340,
    timing: dayLabel(2),
  },
  {
    id: "demo-avail-3",
    reference: "JOB-4907",
    title: "Silicone re-seal — three bathrooms",
    desc: "Serviced apartments block. Straightforward, half-day job.",
    trade: "General Maintenance",
    emergency: false,
    postcode: "EC2A 4NE",
    distance: 1.6,
    duration: "4h",
    total: 380,
    timing: dayLabel(4),
  },
];

export const DEMO_QUOTES: QuoteRequest[] = [
  {
    id: "demo-quote-1",
    reference: "QT-2210",
    title: "Full bathroom refit — second floor",
    desc: "Strip out and refit. Customer supplies suite and tiles.",
    trades: ["Plumbing"],
    serviceType: "Refurbishment",
    propertyAddress: "12 Provost St, London",
    postcode: "N1 7NF",
    distance: 2.7,
    deadline: dayLabel(3),
    status: "to-quote",
  },
  {
    id: "demo-quote-2",
    reference: "QT-2214",
    title: "Rewire two-bed flat",
    desc: "Landlord preparing for a new tenancy. EICR remedials included.",
    trades: ["Electrical"],
    serviceType: "Electrical",
    propertyAddress: "88 Whitecross St, London",
    postcode: "EC1Y 8PX",
    distance: 1.4,
    deadline: dayLabel(5),
    status: "to-quote",
  },
  {
    id: "demo-quote-3",
    reference: "QT-2198",
    title: "Communal hallway redecoration",
    desc: "Block of six flats. Two coats throughout, minor filling.",
    trades: ["General Maintenance"],
    serviceType: "Decorating",
    propertyAddress: "4 Baldwin St, London",
    postcode: "EC1V 9NU",
    distance: 0.9,
    deadline: dayLabel(-1),
    status: "submitted",
    yourBid: 1450,
    myBidNotes: "Includes materials and dust sheets. Five working days.",
  },
];

export const DEMO_DOCS: PartnerDoc[] = [
  { id: "demo-doc-1", name: "Public liability insurance", docType: "insurance", kind: "Insurance", status: "verified", expires: dayLabel(210), required: true, icon: "shield-check", fileName: "public-liability.pdf", fileUrl: null },
  { id: "demo-doc-2", name: "Photo ID", docType: "id_proof", kind: "Identity", status: "verified", expires: "", required: true, icon: "id-card", fileName: "photo-id.jpg", fileUrl: null },
  { id: "demo-doc-3", name: "Proof of address", docType: "proof_of_address", kind: "Identity", status: "verified", expires: "", required: true, icon: "home", fileName: "proof-of-address.pdf", fileUrl: null },
  {
    id: "demo-doc-4",
    name: "Right to work",
    docType: "right_to_work",
    kind: "Identity",
    status: "pending",
    expires: dayLabel(24),
    required: true,
    icon: "badge-check",
    fileName: "right-to-work.pdf",
    fileUrl: null,
    warning: "24 days to expiry",
  },
];

/**
 * Two pay periods: the one running now (accumulating) and the one that just
 * closed, so the dashboard card shows both the live total and a Next payout.
 */
/** The upcoming Friday, so the demo payout is always in the future. */
function nextFriday(): string {
  const today = TODAY();
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 5) return d;
  }
  return addDays(today, 7);
}

export function demoPayPeriodRows(): PayPeriodRow[] {
  const current = fortnightWindow(TODAY());
  const previousStart = addDays(current.startYmd, -14);
  const previousEnd = addDays(current.startYmd, -1);
  return [
    {
      week_start: current.startYmd,
      week_end: current.endYmd,
      payment_cadence: "biweekly",
      due_date: payRunDateFor(current.endYmd),
      status: "accumulating",
      net_payout: 0,
      jobs_count: 0,
    },
    {
      week_start: previousStart,
      week_end: previousEnd,
      payment_cadence: "biweekly",
      // Staged so the demo always lands on the interesting state: a closed
      // period still owed, paying on the next Friday rather than one that
      // already went out. Real data uses the OS due_date untouched.
      due_date: nextFriday(),
      status: "awaiting_payment",
      net_payout: 1485,
      jobs_count: 11,
    },
  ];
}

export function demoSelfBills(): SelfBill[] {
  const current = fortnightWindow(TODAY());
  const p1Start = addDays(current.startYmd, -14);
  const p1End = addDays(current.startYmd, -1);
  const p2Start = addDays(current.startYmd, -28);
  const p2End = addDays(current.startYmd, -15);
  const p3Start = addDays(current.startYmd, -42);
  const p3End = addDays(current.startYmd, -29);
  const range = (a: string, b: string) =>
    `${new Date(`${a}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${b}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const issued = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

  return [
    {
      id: "demo-sb-1",
      reference: "SB-1042",
      issued: issued(addDays(p1End, 1)),
      period: range(p1Start, p1End),
      jobs: 11,
      value: 1720,
      net: 1485,
      statusLabel: "Awaiting Payment",
      tone: "warning",
      hasPdf: true,
      isAccumulating: false,
    },
    {
      id: "demo-sb-2",
      reference: "SB-1028",
      issued: issued(addDays(p2End, 1)),
      period: range(p2Start, p2End),
      jobs: 9,
      value: 1390,
      net: 1204,
      statusLabel: "Paid",
      tone: "success",
      hasPdf: true,
      isAccumulating: false,
    },
    {
      id: "demo-sb-3",
      reference: "SB-1013",
      issued: issued(addDays(p3End, 1)),
      period: range(p3Start, p3End),
      jobs: 7,
      value: 980,
      net: 861,
      statusLabel: "Paid",
      tone: "success",
      hasPdf: true,
      isAccumulating: false,
    },
  ];
}

/** Responses for the `/api/*` endpoints the screens call. */
export const DEMO_API: Record<string, unknown> = {
  "/api/leads": { leads: [] },
  "/api/partner/rating": {
    rating: DEMO_PARTNER.rating,
    complaintCount: 1,
    pointsLost: 0.2,
    topComplaints: [{ label: "Arrived late", count: 1 }],
  },
  "/api/partner/required-docs": {
    required: [
      { id: "id_proof", docType: "id_proof", name: "Photo ID", description: "Passport or driving license" },
      { id: "proof_of_address", docType: "proof_of_address", name: "Proof of Address", description: "Utility bill or bank statement (last 3 months)" },
      { id: "right_to_work", docType: "right_to_work", name: "Right to Work", description: "Share code, birth certificate, or passport" },
      { id: "insurance", docType: "insurance", name: "Public Liability Insurance", description: "Active public liability policy" },
    ],
  },
  "/api/payouts/status": { method: "manual", connected: true, payoutsEnabled: true },
  "/api/portal/policies": { policies: [] },
};
