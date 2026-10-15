"use client";

// Ofertas abertas (jobs e cotações) num lugar só: o contador da navegação, o
// Today e a tela Offers leem daqui, com uma busca a cada minuto.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePartner } from "./partner-context";
import { fetchAvailableJobs } from "@/lib/queries/available-jobs";
import { fetchAvailableQuotes } from "@/lib/queries/quotes";
import type { AvailableJob, QuoteRequest } from "@/types";

const POLL_MS = 60_000;

interface OffersState {
  jobs: AvailableJob[];
  quotes: QuoteRequest[];
  loaded: boolean;
  refresh: () => void;
}

const OffersContext = createContext<OffersState | null>(null);

export function OffersProvider({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  const partner = usePartner();
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [j, q] = await Promise.all([
      fetchAvailableJobs(supabase, partner.id).catch(() => [] as AvailableJob[]),
      fetchAvailableQuotes(supabase, partner.id).catch(() => [] as QuoteRequest[]),
    ]);
    setJobs(j);
    setQuotes(q.filter((x) => x.status === "to-quote"));
    setLoaded(true);
  }, [partner.id]);

  useEffect(() => {
    void load();
    if (paused) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load, paused]);

  return <OffersContext.Provider value={{ jobs, quotes, loaded, refresh: load }}>{children}</OffersContext.Provider>;
}

export function useOffers(): OffersState {
  const ctx = useContext(OffersContext);
  if (!ctx) throw new Error("useOffers must be used within an OffersProvider");
  return ctx;
}

/** Quantas ofertas pedem resposta agora (jobs + cotações). */
export function useOffersCount(): number {
  const { jobs, quotes } = useOffers();
  return jobs.length + quotes.length;
}
