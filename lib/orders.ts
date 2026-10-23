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
