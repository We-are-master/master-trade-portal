import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payRunDateFor, PAY_RUN_ANCHOR_YMD } from "./pay-period";

describe("payRunDateFor", () => {
  it("pays a fortnight ending Sun 16 Aug on Fri 21 Aug", () => {
    assert.equal(payRunDateFor("2026-08-16"), "2026-08-21");
  });

  it("pays a fortnight ending Sun 30 Aug on Fri 4 Sep", () => {
    assert.equal(payRunDateFor("2026-08-30"), "2026-09-04");
  });

  /**
   * The case the old `endYmd + 5` got wrong. Production has weekly self_bills
   * closing Sun 23 Aug with due_date 4 Sep — 12 days, not 5, because 28 Aug is
   * not a pay-run Friday.
   */
  it("makes a week closing Sun 23 Aug wait for Fri 4 Sep, not Fri 28 Aug", () => {
    assert.equal(payRunDateFor("2026-08-23"), "2026-09-04");
  });

  it("makes a week closing Sun 9 Aug wait for Fri 21 Aug", () => {
    assert.equal(payRunDateFor("2026-08-09"), "2026-08-21");
  });

  it("always lands on a Friday", () => {
    for (let i = 0; i < 40; i++) {
      const end = new Date(Date.UTC(2026, 5, 1) + i * 5 * 86_400_000).toISOString().slice(0, 10);
      const pay = payRunDateFor(end);
      assert.equal(new Date(`${pay}T00:00:00Z`).getUTCDay(), 5, `${end} paid on a non-Friday (${pay})`);
    }
  });

  it("always leaves at least the 5-day lag", () => {
    for (let i = 0; i < 40; i++) {
      const end = new Date(Date.UTC(2026, 5, 1) + i * 5 * 86_400_000).toISOString().slice(0, 10);
      const pay = payRunDateFor(end);
      const lag = (Date.parse(`${pay}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86_400_000;
      assert.ok(lag >= 5, `${end} → ${pay} is only ${lag} days`);
    }
  });

  it("keeps pay runs exactly 14 days apart", () => {
    assert.equal(payRunDateFor(PAY_RUN_ANCHOR_YMD), "2026-09-04");
  });
});
