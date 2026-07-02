"use client";

import { useEffect, useState } from "react";
import {
  mergePartnerRegistrationRules,
  type PartnerRegistrationRuleRow,
} from "@/lib/partner-registration-fields";
import type { RegistrationConfig, RegistrationDocumentRule } from "@/lib/registration-config";

type UseRegistrationConfigOptions = {
  /** Pre-login funnel uses the public endpoint. */
  public?: boolean;
};

export function useRegistrationConfig(options: UseRegistrationConfigOptions = {}) {
  const [fields, setFields] = useState<PartnerRegistrationRuleRow[]>(() => mergePartnerRegistrationRules(null));
  const [documents, setDocuments] = useState<RegistrationDocumentRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const url = options.public ? "/api/public/registration-config" : "/api/partner/registration-config";
    void (async () => {
      try {
        const res = await fetch(url);
        const data = (await res.json().catch(() => ({}))) as RegistrationConfig;
        if (!alive) return;
        setFields(data.fields ?? mergePartnerRegistrationRules(null));
        setDocuments(data.documents ?? []);
      } catch {
        if (alive) {
          setFields(mergePartnerRegistrationRules(null));
          setDocuments([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [options.public]);

  return { fields, documents, loading };
}
