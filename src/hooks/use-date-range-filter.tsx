"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  DEFAULT_DATE_FILTER,
  type DateFilterValue,
  dateFilterLabel,
  resolveDateFilterYmd,
} from "@/lib/date-range-filter";

const STORAGE_KEY = "fixfy-trade-portal-date-filter-v1";

function readStored(): DateFilterValue {
  if (typeof window === "undefined") return DEFAULT_DATE_FILTER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATE_FILTER;
    const parsed = JSON.parse(raw) as DateFilterValue;
    if (!parsed?.mode) return DEFAULT_DATE_FILTER;
    return {
      mode: parsed.mode,
      customFrom: parsed.customFrom ?? "",
      customTo: parsed.customTo ?? "",
    };
  } catch {
    return DEFAULT_DATE_FILTER;
  }
}

type DateRangeFilterContextValue = {
  value: DateFilterValue;
  setValue: (next: DateFilterValue) => void;
  label: string;
  bounds: ReturnType<typeof resolveDateFilterYmd>;
};

const DateRangeFilterContext = createContext<DateRangeFilterContextValue | null>(null);

export function DateRangeFilterProvider({ children }: { children: ReactNode }) {
  const [value, setValueState] = useState<DateFilterValue>(readStored);

  const setValue = useCallback((next: DateFilterValue) => {
    setValueState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <DateRangeFilterContext.Provider
      value={{
        value,
        setValue,
        label: dateFilterLabel(value),
        bounds: resolveDateFilterYmd(value),
      }}
    >
      {children}
    </DateRangeFilterContext.Provider>
  );
}

export function useDateRangeFilter(): DateRangeFilterContextValue {
  const ctx = useContext(DateRangeFilterContext);
  if (!ctx) throw new Error("useDateRangeFilter must be used within DateRangeFilterProvider");
  return ctx;
}
