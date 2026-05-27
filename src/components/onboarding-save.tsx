"use client";

// Lets onboarding's "Continue" button auto-save the current step, so the partner doesn't have to
// click each step's own Save button (repetitive). A step registers its save via
// useRegisterOnboardingSave(); the onboarding shell calls it on Continue and only advances if it
// doesn't return false. Lives in its own module so the shared settings pages can import the hook
// without a circular dependency on onboarding.tsx.

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type OnboardingSaveFn = () => Promise<boolean | void>;

const Ctx = createContext<{ set: (fn: OnboardingSaveFn | null) => void } | null>(null);

export function OnboardingSaveProvider({
  value,
  children,
}: {
  value: { set: (fn: OnboardingSaveFn | null) => void };
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Register this step's save with the onboarding shell. No-op when rendered outside onboarding
// (e.g. the same page in Settings). Registers a stable wrapper that always calls the latest closure.
export function useRegisterOnboardingSave(fn: OnboardingSaveFn) {
  const ctx = useContext(Ctx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ctx) return;
    ctx.set(() => ref.current());
    return () => ctx.set(null);
  }, [ctx]);
}
