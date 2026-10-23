"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { back, dbError, int, str } from "./util";

export async function addStock(form: FormData) {
  const me = await requireRole("branch");
  const P = "/branch";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_stock", {
    p_branch: me.branch_id, p_product_name: str(form, "product_name"),
    p_color: str(form, "color"), p_size: str(form, "size"), p_qty: int(form, "qty"),
  });
  if (error) back(P, "err", dbError(error));
  revalidatePath(P);
  back(P, "ok", "تزادت الكمية للستوك. إذا المنتج جديد، ينتظر المدير يحط السعر.");
}

// العد: كل input اسمو c_<variant_id>
export async function submitCount(form: FormData) {
  await requireRole("branch");
  const P = "/branch";
  const lines: { variant_id: string; counted: number }[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("c_")) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) back(P, "err", "العدد لازم يكون رقم 0 ولا أكثر");
    lines.push({ variant_id: k.slice(2), counted: n });
  }
  const sb = await supabaseServer();
  const { error } = await sb.rpc("submit_stock_count", { p_product: str(form, "product_id"), p_lines: lines });
  if (error) back(P, "err", dbError(error));
  revalidatePath(P);
  back(P, "ok", "تحفظ العد وتحدث الستوك");
}

export async function recordReturn(form: FormData) {
  await requireRole("branch");
  const P = "/branch/returns";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("record_return", {
    p_variant: str(form, "variant_id"), p_qty: int(form, "qty"), p_parcel_ref: str(form, "parcel_ref") || null,
  });
  if (error) back(P, "err", dbError(error));
  revalidatePath(P);
  back(P, "ok", "تسجل الرتور ورجع للستوك");
}

export async function setLiquidity(form: FormData) {
  await requireRole("branch");
  const P = "/branch/account";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_liquidity", { p_amount: int(form, "amount") });
  if (error) back(P, "err", dbError(error));
  revalidatePath(P);
  back(P, "ok", "تحدثت السيولة");
}
