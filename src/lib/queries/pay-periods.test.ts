import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPayPeriodSummary, compareRunningCandidates, type PayPeriodRow } from "./pay-periods";

const row = (over: Partial<PayPeriodRow>): PayPeriodRow => ({
  week_start: "2026-08-17",
  week_end: "2026-08-30",
  payment_cadence: "biweekly",
  due_date: "2026-09-04",
  status: "accumulating",
  net_payout: 0,
  jobs_count: 0,
  ...over,
});

const HOJE = "2026-08-24";

describe("compareRunningCandidates", () => {
  /** G&M Services on 24 Aug 2026: an empty shell beside the row holding £950. */
  it("prefers the open row that holds the work over the empty one", () => {
    const vazia = row({ status: "accumulating", net_payout: 0 });
    const cheia = row({ status: "accumulating", net_payout: 950 });
    assert.equal([vazia, cheia].sort(compareRunningCandidates)[0], cheia);
    assert.equal([cheia, vazia].sort(compareRunningCandidates)[0], cheia);
  });

  it("still prefers an open row over a closed one, money or not", () => {
    const aberta = row({ status: "accumulating", net_payout: 0 });
    const fechada = row({ status: "awaiting_payment", net_payout: 950 });
    assert.equal([fechada, aberta].sort(compareRunningCandidates)[0], aberta);
  });

  /** The old comparator returned a constant here, so the DB order decided. */
  it("does not depend on the order the rows arrived in", () => {
    const a = row({ week_start: "2026-08-17", week_end: "2026-08-30" });
    const b = row({ week_start: "2026-08-24", week_end: "2026-09-06" });
    const um = [a, b].sort(compareRunningCandidates)[0];
    const dois = [b, a].sort(compareRunningCandidates)[0];
    assert.equal(um.week_start, dois.week_start);
  });
});

describe("buildPayPeriodSummary — janela corrente", () => {
  it("shows the £950 window, not the empty one over the same days", () => {
    const { current } = buildPayPeriodSummary(
      [row({ net_payout: 0 }), row({ net_payout: 950 })],
      HOJE,
    );
    assert.equal(current.osNet, 950);
    assert.equal(current.startYmd, "2026-08-17");
    assert.equal(current.payRunYmd, "2026-09-04");
    assert.equal(current.fromOs, true);
  });

  /** RJ Cleaner Services: two open windows straddling today, one with £277. */
  it("picks the same window whichever order the rows come back in", () => {
    const grade = row({ week_start: "2026-08-17", week_end: "2026-08-30", net_payout: 0 });
    const fora = row({ week_start: "2026-08-24", week_end: "2026-09-06", net_payout: 277, due_date: "2026-09-18" });
    const a = buildPayPeriodSummary([grade, fora], HOJE).current;
    const b = buildPayPeriodSummary([fora, grade], HOJE).current;
    assert.deepEqual([a.startYmd, a.endYmd, a.payRunYmd], [b.startYmd, b.endYmd, b.payRunYmd]);
  });

  it("never counts a cancelled row as the running period", () => {
    const { current } = buildPayPeriodSummary(
      [row({ status: "payout_cancelled", net_payout: 0 }), row({ status: "accumulating", net_payout: 277 })],
      HOJE,
    );
    assert.equal(current.osNet, 277);
  });

  it("falls back to the standard grid when the partner has no bill yet", () => {
    const { current } = buildPayPeriodSummary([], HOJE);
    assert.equal(current.fromOs, false);
    assert.equal(current.startYmd, "2026-08-17");
    assert.equal(current.endYmd, "2026-08-30");
    assert.equal(current.payRunYmd, "2026-09-04");
  });

  it("uses the row's own due_date over the derived one", () => {
    const { current } = buildPayPeriodSummary([row({ net_payout: 12, due_date: "2026-09-18" })], HOJE);
    assert.equal(current.payRunYmd, "2026-09-18");
  });
});

describe("buildPayPeriodSummary — proximo pagamento", () => {
  it("groups closed unpaid bills into the run that pays them", () => {
    const { pending } = buildPayPeriodSummary(
      [
        row({ status: "awaiting_payment", net_payout: 950, due_date: "2026-09-04" }),
        row({ status: "awaiting_payment", net_payout: 50, due_date: "2026-09-04" }),
      ],
      HOJE,
    );
    assert.equal(pending?.payRunYmd, "2026-09-04");
    assert.equal(pending?.net, 1000);
    assert.equal(pending?.bills, 2);
  });

  it("leaves paid and cancelled money out of the next run", () => {
    const { pending } = buildPayPeriodSummary(
      [
        row({ status: "paid", net_payout: 500, due_date: "2026-09-04" }),
        row({ status: "payout_cancelled", net_payout: 300, due_date: "2026-09-04" }),
      ],
      HOJE,
    );
    assert.equal(pending, null);
  });
});
