import type { AvailableJob, MyJob, QuoteRequest } from "@/types";

type LeadLike = {
  title: string;
  desc?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  budget?: number | null;
  reference?: string | null;
  notes?: string | null;
};

export function maskPostcode(postcode: string | null | undefined): string {
  const t = (postcode ?? "").trim();
  if (!t) return "—";
  if (t.length <= 3) return "•••";
  return `${t.slice(0, 2)}•• •••`;
}

export function redactLead<T extends LeadLike>(lead: T): T {
  return {
    ...lead,
    title: "Customer enquiry",
    desc: "Details unlock after you add your card.",
    postcode: maskPostcode(lead.postcode),
    phone: null,
    email: null,
    address: null,
    budget: null,
    reference: lead.reference ? "••••" : null,
    notes: null,
  };
}

export function redactAvailableJob(job: AvailableJob): AvailableJob {
  return {
    ...job,
    title: "Available job",
    desc: "Job details unlock after you add your card.",
    postcode: maskPostcode(job.postcode),
    total: 0,
  };
}

export function redactQuote(q: QuoteRequest): QuoteRequest {
  return {
    ...q,
    title: "Quote request",
    desc: "Details unlock after you add your card.",
    propertyAddress: undefined,
    postcode: maskPostcode(q.postcode),
  };
}

export function redactMyJob(job: MyJob): MyJob {
  return {
    ...job,
    title: "Assigned job",
    desc: "Details unlock after you add your card.",
    postcode: maskPostcode(job.postcode),
    customer: { ...job.customer, name: "Customer", address: "Hidden" },
    total: 0,
  };
}
