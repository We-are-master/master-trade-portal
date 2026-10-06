"use client";

// The VAT status line a partner confirms when signing: "I am not VAT registered"
// or "I am VAT registered, number ___". Used by the /get-started Agreements step
// and by Settings → Policies when the partner signs new agreement versions.

import { T } from "@/lib/tokens";
import {
  VAT_NOT_REGISTERED_LABEL,
  VAT_REGISTERED_LABEL,
  isValidUkVatNumber,
  type VatStatusDraft,
} from "@/lib/vat-status";

export function VatStatusField({
  value,
  onChange,
  disabled = false,
}: {
  value: VatStatusDraft;
  onChange: (next: VatStatusDraft) => void;
  disabled?: boolean;
}) {
  const numberProblem =
    value.registered === true && value.number.trim() && !isValidUkVatNumber(value.number)
      ? "Enter a UK VAT number, like GB123456789."
      : null;

  const option = (registered: boolean, label: string) => {
    const selected = value.registered === registered;
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${selected ? T.coral : T.line}`,
          background: selected ? T.coralTint : T.white,
          cursor: disabled ? "default" : "pointer",
          fontSize: 14,
          fontWeight: 600,
          color: T.ink,
        }}
      >
        <input
          type="radio"
          name="vat-status"
          checked={selected}
          disabled={disabled}
          onChange={() => onChange({ ...value, registered })}
          style={{ width: 16, height: 16, accentColor: T.coral, margin: 0 }}
        />
        <span>
          {label}
          {registered && selected ? <span style={{ fontWeight: 400, color: T.slate }}>, number</span> : null}
        </span>
      </label>
    );
  };

  return (
    <div style={{ display: "grid", gap: 8, textAlign: "left" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Your VAT status</div>
      {option(false, VAT_NOT_REGISTERED_LABEL)}
      {option(true, VAT_REGISTERED_LABEL)}
      {value.registered === true && (
        <div>
          <input
            value={value.number}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, number: e.target.value })}
            placeholder="GB123456789"
            aria-label="VAT registration number"
            aria-invalid={Boolean(numberProblem)}
            style={{
              width: "100%",
              height: 44,
              padding: "0 14px",
              borderRadius: 10,
              border: `1px solid ${numberProblem ? T.red : T.lineStrong}`,
              background: T.white,
              color: T.ink,
              fontFamily: T.mono,
              fontSize: 15,
              outline: "none",
            }}
          />
          {numberProblem && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.red }}>{numberProblem}</p>}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
        This is your VAT Status Declaration (Annex 1 of the Invoicing and Payment Collection Agreement). We issue
        receipts to your customers in your name on the strength of it, so tell us within 14 days if it changes.
      </p>
    </div>
  );
}
