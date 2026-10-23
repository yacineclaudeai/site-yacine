"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { back, dbError, int, str } from "./util";

const BACKS = /^\/(confirm(\/(wait|sent))?|dispatch|manager(\/(orders|confirmers))?)$/;
const backTo = (f: FormData, fallback: string) => (BACKS.test(str(f, "back")) ? str(f, "back") : fallback);

function lines(f: FormData): { variant_id: string }[] | null {
  try {
    const ids = JSON.parse(str(f, "lines"));
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some((x) => typeof x !== "string" || !x)) return null;
    return ids.map((variant_id: string) => ({ variant_id }));
  } catch {
    return null;
  }
}

async function call(P: string, fn: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, args);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/", "layout");
  back(P, "ok", ok);
}

export async function confirmOrder(f: FormData) {
  await requireRole("confirmer", "manager");
  const P = backTo(f, "/confirm"), l = lines(f);
  if (!l) back(P, "err", "اختار المنتج واللون والمقاس");
  await call(P, "confirm_order", { p_order: int(f, "id"), p_lines: l }, "تأكدت. تقدر تبدل القطع ولا تلغيها قبل ما تتبعث.");
}

const MARK_OK: Record<string, string> = { noans: "تسجلت: ما جاوبش.", postpone: "تأجلت.", dup: "تسجلت مكررة.", cancel: "تلغات." };
export async function markOrder(f: FormData) {
  await requireRole("confirmer", "manager");
  const P = backTo(f, "/confirm"), a = str(f, "action");
  if (!MARK_OK[a]) back(P, "err", "عملية ما نعرفهاش");
  await call(P, "mark_order", { p_order: int(f, "id"), p_action: a }, MARK_OK[a]);
}

export async function updateLines(f: FormData) {
  await requireRole("confirmer", "manager");
  const P = backTo(f, "/confirm/wait"), l = lines(f);
  if (!l) back(P, "err", "اختار المنتج واللون والمقاس");
  await call(P, "update_waiting_lines", { p_order: int(f, "id"), p_lines: l }, "تبدلت القطع. الوقت ما تبدلش.");
}

export async function cancelWaiting(f: FormData) {
  await requireRole("confirmer", "manager");
  await call(backTo(f, "/confirm/wait"), "cancel_waiting", { p_order: int(f, "id") }, "تلغات، والكمية رجعت للستوك.");
}

export async function sendNow(f: FormData) {
  await requireRole("manager", "dispatch");
  await call(backTo(f, "/manager"), "send_now", { p_order: int(f, "id") }, "تبعثت لشركة التوصيل (تجريبي).");
}

export async function sendAll(f: FormData) {
  await requireRole("manager", "dispatch");
  await call(backTo(f, "/manager"), "send_all_waiting", {}, "تبعثو كامل (تجريبي).");
}

export async function createOrder(f: FormData) {
  await requireRole("manager");
  const P = "/manager/orders";
  const name = str(f, "name"), phone = str(f, "phone"), wilaya = str(f, "wilaya");
  if (!name || !phone || !wilaya || !str(f, "product_id")) back(P, "err", "دخل الاسم والهاتف والولاية والمنتج");
  const kind = str(f, "kind") === "abandoned" ? "abandoned" : "normal";
  await call(P, "create_order", {
    p_name: name, p_phone: phone, p_wilaya: wilaya, p_commune: str(f, "commune"),
    p_product: str(f, "product_id"), p_qty: Math.min(10, Math.max(1, int(f, "qty") || 1)), p_kind: kind,
  }, "تزادت الطلبية. راحت للمؤكدة تاع هذا المنتج.");
}

// توزيع منتج على مؤكدة (فارغ = بلا مؤكدة)
export async function assignProduct(f: FormData) {
  await requireRole("manager");
  const P = "/manager/confirmers", pid = str(f, "product_id"), cid = str(f, "confirmer_id");
  const sb = await supabaseServer();
  const { error } = cid
    ? await sb.from("product_confirmers").upsert({ product_id: pid, confirmer_id: cid })
    : await sb.from("product_confirmers").delete().eq("product_id", pid);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/", "layout");
  back(P, "ok", "تحفظ التوزيع.");
}
