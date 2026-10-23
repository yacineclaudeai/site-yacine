import type { OrderStatus } from "@/lib/orders";

const ST: Record<OrderStatus, [string, string]> = {
  new: ["جديدة", ""], failed1: ["فاشلة 1", "warn"], failed2: ["فاشلة 2", "warn"], failed3: ["فاشلة 3", "bad"],
  postponed: ["مؤجلة", "warn"], dup: ["مكررة", "bad"], cancelled: ["ملغاة", "bad"], wait: ["في الانتظار", "warn"],
  sent: ["أُرسلت", "ok"], returned: ["رجعت", "bad"],
};

export function StatusChip({ s }: { s: OrderStatus }) {
  const [l, c] = ST[s];
  return <span className={`chip ${c}`}>{l}</span>;
}
