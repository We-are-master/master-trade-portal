"use client";

// Loads the signed-in partner's real jobs from Supabase (RLS-scoped) and shares them
// across My jobs (board/list/map) and the job drawer. One fetch per session; refresh().

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePartner } from "./partner-context";
import { JOB_SELECT, mapJob, type JobRow } from "@/lib/queries/map-job";
import type { MyJob } from "@/types";

interface JobsState {
  jobs: MyJob[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const JobsContext = createContext<JobsState | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const partner = usePartner();
  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("jobs")
        .select(JOB_SELECT)
        .eq("partner_id", partner.id)
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      setJobs((data as unknown as JobRow[]).map(mapJob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return <JobsContext.Provider value={{ jobs, loading, error, refresh: load }}>{children}</JobsContext.Provider>;
}

export function useMyJobs(): JobsState {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useMyJobs must be used within a JobsProvider");
  return ctx;
}
