// الحسابات. القواعد من النموذج (prototype.html) ومن CLAUDE.md، تتراجع مع الكاسيت.
import type { BranchType, LedgerType } from "./types";

export type LedgerSums = Record<LedgerType, number>;

export function ledgerSums(entries: { type: LedgerType; amount: number }[]): LedgerSums {
  const s: LedgerSums = { collected: 0, purchase: 0, sent: 0, ads: 0 };
  for (const e of entries) s[e.type] += Number(e.amount);
  return s;
}

// الدراهم اللي عند الفرع = اللي رفد من شركة التوصيل − اللي خلص بيه المورد − اللي بعث للمدير
export function held(s: LedgerSums): number {
  return s.collected - s.purchase - s.sent;
}

// ---------- حساب المنتج (يستعمل في المرحلة 2، والتيستات تثبت المعادلة من ذركا) ----------
export type ProductAccInput = {
  qty: number;        // كمية الشراء (الدفعة كاملة)
  buy: number;        // سعر الشراء للقطعة
  parcels: number;    // كوليات مبعوثة
  pack: number;       // تغليف لكل كولي
  label: number;      // إتيكات لكل كولي
  retPack: number;    // تغليف الرتور لكل كولي راجع
  retN: number;       // كوليات راجعة
  conf: number;       // سعر التأكيد
  confN: number;      // طلبيات مؤكدة (مع الراجعة)
  inDelP: number;     // كوليات مازال في التوصيل
  suiviRate: number;  // السويفي لكل طلبية متسلمة
  creative: number;
  other: number;
  usd: number;        // أدس بالدولار
  rate: number;       // سعر الصرف
  sales: number;      // النات اللي وصل من شركة التوصيل
  delN: number;       // قطع متسلمة
  inDel: number;      // قطع في التوصيل
  selling: boolean;   // المنتج مازال يتباع؟
};

export type ProductState = "profit" | "selling" | "loss";

export function productResult(a: ProductAccInput) {
  const delivered = Math.max(0, a.parcels - a.retN - a.inDelP);
  const rows: [string, number][] = [
    ["الشراء (الدفعة كاملة)", a.qty * a.buy],
    ["التغليف", a.pack * a.parcels],
    ["الإتيكات", a.label * a.parcels],
    ["تغليف الرتور", a.retPack * a.retN],
    ["التأكيد (مع الراجعة)", a.conf * a.confN],
    ["السويفي (لكل طلبية متسلمة)", a.suiviRate * delivered],
    ["الكرياتيف", a.creative],
    ["مصاريف أخرى", a.other],
    ["الأدس", a.usd * a.rate],
  ];
  const expenses = rows.reduce((t, r) => t + r[1], 0);
  const profit = a.sales - expenses;
  const leftover = Math.max(0, a.qty - a.delN - a.inDel);
  const state: ProductState = profit >= 0 ? "profit" : a.selling ? "selling" : "loss";
  return { rows, expenses, profit, leftover, state };
}

// ---------- تسوية الفرع ----------
// 50/50: يرجع الأدس + نص الفايدة (ولا يتحمل نص الخسارة). شهرية وأدس فقط: يرجع الأدس غير.
export function branchDue(type: BranchType, adsDzd: number, profit: number, sentToManager: number) {
  const share = type === "half" ? profit / 2 : 0;
  const owed = Math.round(adsDzd + share);
  return { ads: Math.round(adsDzd), profit: Math.round(profit), share: Math.round(share), owed, sent: sentToManager, left: owed - sentToManager };
}
