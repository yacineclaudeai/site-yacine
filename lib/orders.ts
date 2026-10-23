import "server-only";
import { supabaseServer } from "./supabase/server";

export type OrderStatus = "new" | "failed1" | "failed2" | "failed3" | "postponed" | "dup" | "cancelled" | "wait" | "sent" | "returned";
export const QUEUE: OrderStatus[] = ["new", "failed1", "failed2", "failed3", "postponed"];
export const PAY_PER_CONFIRM = 50;

export type OrderLine = { id: number; variant_id: string; product_name: string; color: string; size: string; unit_price: number };
export type Order = {
  id: number; customer_name: string; phone: string; wilaya: string; commune: string | null;
  product_id: string | null; product_name: string; qty: number; status: OrderStatus;
  confirmed_by: string | null; confirmed_at: string | null; wait_seconds: number | null; send_at: string | null;
  sent_at: string | null; sent_by: string | null; created_at: string;
  address: string | null; notes: string | null; details: string | null; delivery_type: string | null;
  unit_price: number | null; delivery_price: number | null; discount: number | null; total_price: number | null;
  order_lines: OrderLine[];
};
export type CatalogRow = { product_id: string; product_name: string; price: number; variant_id: string; color: string; size: string; stock: number };
export type CatalogProduct = { id: string; name: string; price: number; variants: { id: string; label: string; stock: number }[] };

const SELECT = "*, order_lines(id, variant_id, product_name, color, size, unit_price)";

// الإرسال التلقائي: pg_cron يبعث كل دقيقة، وكل صفحة فيها طلبيات تعيطلو زادة باش ما نستناوش.
export async function sendDue() {
  const sb = await supabaseServer();
  await sb.rpc("send_due_orders");
}

export async function loadOrders(statuses?: OrderStatus[]): Promise<Order[]> {
  const sb = await supabaseServer();
  let q = sb.from("orders").select(SELECT).order("id", { ascending: false });
  if (statuses) q = q.in("status", statuses);
  const { data } = await q;
  const list = (data ?? []) as Order[];
  list.forEach((o) => o.order_lines.sort((a, b) => a.id - b.id));
  return list;
}

// جدول الطلبات: الفلتر يتدار في قاعدة البيانات (التاريخ بتوقيت الجزائر، UTC+1)
export const STATUS_GROUPS: Record<string, { label: string; statuses: OrderStatus[] }> = {
  pending:   { label: "معلقة (ما تأكدتش بعد)", statuses: ["new", "postponed"] },
  confirmed: { label: "مؤكدة", statuses: ["wait", "sent", "returned"] },
  failed:    { label: "فاشلة (ما جاوبش)", statuses: ["failed1", "failed2", "failed3"] },
  cancelled: { label: "ملغية ومكررة", statuses: ["cancelled", "dup"] },
};
export const ORDERS_LIMIT = 500;
export async function loadOrdersFiltered(f: { statuses?: OrderStatus[]; from?: string; to?: string; q?: string }) {
  const sb = await supabaseServer();
  let q = sb.from("orders").select(SELECT, { count: "exact" }).order("id", { ascending: false }).limit(ORDERS_LIMIT);
  if (f.statuses?.length) q = q.in("status", f.statuses);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (f.from && day.test(f.from)) q = q.gte("created_at", `${f.from}T00:00:00+01:00`);
  if (f.to && day.test(f.to)) {
    const next = new Date(`${f.to}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    q = q.lt("created_at", `${next.toISOString().slice(0, 10)}T00:00:00+01:00`);
  }
  const t = (f.q ?? "").trim().replace(/[,()*%\\]/g, " ").trim();
  if (t) {
    const d = t.replace(/\D/g, "");
    q = q.or([`customer_name.ilike.*${t}*`, `wilaya.ilike.*${t}*`, `commune.ilike.*${t}*`, `product_name.ilike.*${t}*`,
      ...(d.length >= 4 ? [`phone.ilike.*${d.slice(-8)}*`] : [])].join(","));
  }
  const { data, count } = await q;
  const list = (data ?? []) as Order[];
  list.forEach((o) => o.order_lines.sort((a, b) => a.id - b.id));
  return { list, count: count ?? list.length };
}

export async function loadWaiting(): Promise<Order[]> {
  const list = await loadOrders(["wait"]);
  return list.sort((a, b) => (a.send_at ?? "").localeCompare(b.send_at ?? ""));
}

export async function loadCatalog(): Promise<CatalogProduct[]> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("order_catalog");
  const map = new Map<string, CatalogProduct>();
  for (const r of (data ?? []) as CatalogRow[]) {
    if (!map.has(r.product_id)) map.set(r.product_id, { id: r.product_id, name: r.product_name, price: r.price, variants: [] });
    map.get(r.product_id)!.variants.push({ id: r.variant_id, label: `${r.color} / ${r.size}`, stock: r.stock });
  }
  return [...map.values()];
}

export const linesText = (o: Order) =>
  o.order_lines.length ? o.order_lines.map((l) => `${l.product_name} · ${l.color} / ${l.size}`).join(" + ") : "-";

// بداية الدورة الشهرية من نهار الدخول (كيما النموذج)
export function cycleStart(joined: string, now = new Date()): Date {
  const j = new Date(joined + "T00:00:00");
  let st = new Date(now.getFullYear(), now.getMonth(), j.getDate());
  if (st > now) st = new Date(now.getFullYear(), now.getMonth() - 1, j.getDate());
  return st;
}

// عدد الطلبيات المؤكدة في الدورة (مع اللي رجعو، بلا اللي تلغاو في الانتظار)
export async function confirmedCounts(people: { id: string; joined_at: string }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(people.map((p) => [p.id, 0]));
  if (!people.length) return out;
  const since = people.map((p) => cycleStart(p.joined_at)).reduce((a, b) => (a < b ? a : b));
  const sb = await supabaseServer();
  const { data } = await sb.from("orders").select("confirmed_by, confirmed_at")
    .in("status", ["wait", "sent", "returned"]).gte("confirmed_at", since.toISOString());
  const start = new Map(people.map((p) => [p.id, cycleStart(p.joined_at)]));
  for (const r of data ?? []) {
    const s = start.get(r.confirmed_by);
    if (s && new Date(r.confirmed_at) >= s) out.set(r.confirmed_by, (out.get(r.confirmed_by) ?? 0) + 1);
  }
  return out;
}

export const FOLLOW = ["لا يرد", "رايح للمكتب", "تفاهم مع الليفرور", "أنيلاها", "غير مطابقة", "مؤجلة"] as const;

// نفس phone_key() تاع القاعدة
export const phoneKey = (p: string) => p.replace(/\D/g, "").replace(/^00213/, "0").replace(/^213/, "0");

// لأنهي فرع وأنهي شركة توصيل يروح كل كولي (المدير وعامل الإرسال برك)
export type Route = { branch_name: string; delivery_company: string | null; has_key: boolean };
export async function loadRoutes(): Promise<Map<number, Route[]>> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("send_preview");
  const out = new Map<number, Route[]>();
  for (const r of (data ?? []) as (Route & { order_id: number })[]) out.set(r.order_id, [...(out.get(r.order_id) ?? []), r]);
  return out;
}
