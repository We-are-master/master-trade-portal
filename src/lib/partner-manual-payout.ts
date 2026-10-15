// Manual UK bank details for partner payouts — stored on the partner row (no Stripe call).
//
// Desde 15/10/2026 grava nas MESMAS colunas que a ficha do parceiro no OS lê e edita
// (`partners.bank_account_holder`, `bank_sort_code`, `bank_account_number`, só dígitos).
// Antes ia para `notification_prefs._portal.payoutBank`, que o OS não lê: o parceiro via
// "salvo" no portal e o escritório não tinha a conta para pagar. Esse campo antigo segue
// só como reserva de leitura e é removido quando o parceiro salva de novo.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ManualPayoutBank {
  accountHolder: string;
  sortCode: string;
  accountNumber: string;
  savedAt?: string;
}

interface PortalPrefs {
  payoutBank?: ManualPayoutBank;
}

interface NotificationPrefsRow {
  _portal?: PortalPrefs;
  [key: string]: unknown;
}

interface PartnerBankRow {
  bank_account_holder?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
  notification_prefs?: NotificationPrefsRow | null;
}

const soDigitos = (v: string | null | undefined): string => String(v ?? "").replace(/\D/g, "");

export async function getManualPayoutBank(
  svc: SupabaseClient,
  partnerId: string,
): Promise<ManualPayoutBank | null> {
  const { data } = await svc
    .from("partners")
    .select("bank_account_holder, bank_sort_code, bank_account_number, notification_prefs")
    .eq("id", partnerId)
    .maybeSingle();
  const row = data as PartnerBankRow | null;
  if (!row) return null;

  const holder = String(row.bank_account_holder ?? "").trim();
  const sort = soDigitos(row.bank_sort_code);
  const account = soDigitos(row.bank_account_number);
  if (holder && sort.length === 6 && account.length >= 6) {
    return { accountHolder: holder, sortCode: sort, accountNumber: account };
  }

  // Reserva: salvo pelo portal antes de 15/10/2026 e ainda não copiado para as colunas.
  return row.notification_prefs?._portal?.payoutBank ?? null;
}

export async function saveManualPayoutBank(
  svc: SupabaseClient,
  partnerId: string,
  bank: Omit<ManualPayoutBank, "savedAt">,
): Promise<void> {
  const { data } = await svc.from("partners").select("notification_prefs").eq("id", partnerId).maybeSingle();
  const existing = ((data as { notification_prefs?: NotificationPrefsRow } | null)?.notification_prefs ?? {}) as NotificationPrefsRow;

  // Tira a cópia antiga para não existir duas contas diferentes para o mesmo parceiro.
  const portal = { ...(existing._portal ?? {}) };
  delete portal.payoutBank;
  const notification_prefs: NotificationPrefsRow = { ...existing, _portal: portal };

  const { error } = await svc
    .from("partners")
    .update({
      bank_account_holder: bank.accountHolder.trim(),
      bank_sort_code: soDigitos(bank.sortCode),
      bank_account_number: soDigitos(bank.accountNumber),
      notification_prefs,
      payouts_enabled: true,
    })
    .eq("id", partnerId);
  if (error) throw error;
}
