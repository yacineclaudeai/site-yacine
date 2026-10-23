import { describe, expect, it } from "vitest";
import { branchDue, held, ledgerSums, productResult, type ProductAccInput } from "../../lib/accounting";

// أرقام p1 (بيجامة قطيفة) من النموذج
const p1: ProductAccInput = {
  qty: 150, parcels: 118, inDelP: 10, buy: 800, pack: 20, label: 5, retPack: 20, conf: 50, confN: 120,
  retN: 18, delN: 96, inDel: 12, sales: 231000, suiviRate: 50, creative: 3000, other: 1700, usd: 0, rate: 252, selling: true,
};

describe("ledger", () => {
  it("held = collected − purchase − sent (ads ما تدخلش)", () => {
    const s = ledgerSums([
      { type: "collected", amount: 420000 },
      { type: "purchase", amount: 150000 },
      { type: "sent", amount: 100000 },
      { type: "ads", amount: 60000 },
    ]);
    expect(held(s)).toBe(170000);
  });
  it("reversal entries (negative) cancel the original", () => {
    const s = ledgerSums([{ type: "sent", amount: 5000 }, { type: "sent", amount: -5000 }]);
    expect(s.sent).toBe(0);
  });
});

describe("productResult", () => {
  it("computes every cost line for p1", () => {
    const r = productResult(p1);
    // 120000 + 2360 + 590 + 360 + 6000 + 50*90 + 3000 + 1700 + 0
    expect(r.expenses).toBe(120000 + 2360 + 590 + 360 + 6000 + 4500 + 3000 + 1700);
    expect(r.profit).toBe(231000 - r.expenses);
    expect(r.leftover).toBe(150 - 96 - 12);
    expect(r.state).toBe("profit");
  });
  it("whole purchase batch counts as cost even if unsold", () => {
    const r = productResult({ ...p1, sales: 0, parcels: 0, confN: 0, retN: 0, inDelP: 0, delN: 0, inDel: 0, creative: 0, other: 0 });
    expect(r.expenses).toBe(150 * 800);
    expect(r.leftover).toBe(150);
  });
  it("negative result is 'selling' while the flag is on, 'loss' otherwise", () => {
    const neg = { ...p1, sales: 1000 };
    expect(productResult(neg).state).toBe("selling");
    expect(productResult({ ...neg, selling: false }).state).toBe("loss");
  });
  it("ads are converted with the exchange rate", () => {
    const base = productResult(p1).expenses;
    expect(productResult({ ...p1, usd: 120, rate: 254 }).expenses).toBe(base + 120 * 254);
  });
  it("suivi is paid only on delivered parcels (never negative)", () => {
    const r = productResult({ ...p1, parcels: 5, retN: 4, inDelP: 3 });
    expect(r.rows.find((x) => x[0].startsWith("السويفي"))![1]).toBe(0);
  });
});

describe("branchDue", () => {
  it("50/50 returns ads + half the profit", () => {
    expect(branchDue("half", 60000, 100000, 20000)).toMatchObject({ owed: 110000, left: 90000, share: 50000 });
  });
  it("50/50 carries half the loss", () => {
    expect(branchDue("half", 60000, -40000, 0).owed).toBe(40000);
  });
  it("salary and ads-only branches return ads only", () => {
    expect(branchDue("salary", 30000, 500000, 0).owed).toBe(30000);
    expect(branchDue("ads", 30000, -500000, 0).owed).toBe(30000);
  });
});
