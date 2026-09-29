// Partner self-service settings stored as jsonb on partners (migration 200): availability,
// job_preferences, notification_prefs. Reads merge with defaults so the UI works even before
// the partner has saved anything (or before 200 is applied — caller treats a read error as defaults).

import type { SupabaseClient } from "@supabase/supabase-js";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export interface DayWindow {
  on: boolean;
  start: string;
  end: string;
}
export interface Availability {
  days: Record<DayKey, DayWindow>;
  bufferMins: number;
  maxJobsPerDay: number;
  lunch: { start: string; end: string };
  emergency247: boolean;
  /** Folgas por data, "YYYY-MM-DD": nesses dias não chega oferta nem conta na capacidade. */
  daysOff?: string[];
}

export interface JobPreferences {
  receiveLeads: boolean;
  receiveEmergency: boolean;
  receiveMultiDay: boolean;
  insuranceOnly: boolean;
  minJobValue: number;
  maxActiveJobs: number;
  /** Auto-accept: job que bate vira do parceiro na hora. Só vale com o aceite gravado. */
  autoAccept?: { on: boolean; acceptedAt: string | null; termsVersion: string | null };
}

/** Versão do texto das regras do auto-accept que o parceiro aceita. */
export const AUTO_ACCEPT_TERMS_VERSION = "2026-09-29";

export const NOTIFICATION_EVENTS = [
  { key: "new_lead", label: "New lead matched" },
  { key: "emergency", label: "Emergency near you" },
  { key: "job_assigned", label: "Job assigned to you" },
  { key: "quote_accepted", label: "Quote accepted" },
  { key: "signed_off", label: "Customer signed off" },
  { key: "self_bill", label: "Self-bill issued" },
  { key: "doc_expiring", label: "Document expiring" },
  { key: "new_review", label: "New review" },
] as const;
export interface Channels {
  email: boolean;
  push: boolean;
  sms: boolean;
}
export type NotificationPrefs = Record<string, Channels>;

export const DEFAULT_AVAILABILITY: Availability = {
  days: {
    mon: { on: true, start: "08:00", end: "18:00" },
    tue: { on: true, start: "08:00", end: "18:00" },
    wed: { on: true, start: "08:00", end: "18:00" },
    thu: { on: true, start: "08:00", end: "18:00" },
    fri: { on: true, start: "08:00", end: "17:00" },
    sat: { on: false, start: "09:00", end: "14:00" },
    sun: { on: false, start: "09:00", end: "14:00" },
  },
  bufferMins: 30,
  maxJobsPerDay: 5,
  lunch: { start: "12:30", end: "13:00" },
  emergency247: false,
};

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  receiveLeads: true,
  receiveEmergency: true,
  receiveMultiDay: false,
  insuranceOnly: false,
  minJobValue: 80,
  maxActiveJobs: 6,
};

export function defaultNotificationPrefs(): NotificationPrefs {
  const out: NotificationPrefs = {};
  for (const e of NOTIFICATION_EVENTS) out[e.key] = { email: true, push: false, sms: false };
  return out;
}

export interface PartnerSettings {
  availability: Availability;
  jobPreferences: JobPreferences;
  notificationPrefs: NotificationPrefs;
}

export async function fetchPartnerSettings(supabase: SupabaseClient, partnerId: string): Promise<PartnerSettings> {
  const { data, error } = await supabase
    .from("partners")
    .select("availability, job_preferences, notification_prefs")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as { availability?: Partial<Availability>; job_preferences?: Partial<JobPreferences>; notification_prefs?: NotificationPrefs };
  return {
    availability: {
      ...DEFAULT_AVAILABILITY,
      ...(row.availability ?? {}),
      days: { ...DEFAULT_AVAILABILITY.days, ...(row.availability?.days ?? {}) },
      lunch: { ...DEFAULT_AVAILABILITY.lunch, ...(row.availability?.lunch ?? {}) },
    },
    jobPreferences: { ...DEFAULT_JOB_PREFERENCES, ...(row.job_preferences ?? {}) },
    notificationPrefs: { ...defaultNotificationPrefs(), ...(row.notification_prefs ?? {}) },
  };
}

export async function savePartnerSettings(
  supabase: SupabaseClient,
  partnerId: string,
  patch: Partial<{ availability: Availability; job_preferences: JobPreferences; notification_prefs: NotificationPrefs }>,
): Promise<void> {
  const { error } = await supabase.from("partners").update(patch).eq("id", partnerId);
  if (error) throw error;
}
