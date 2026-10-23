"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BranchType, LedgerType, Role } from "@/lib/types";
import { back, dbError, int, str } from "./util";

const ROLES: Role[] = ["manager", "confirmer", "branch", "suivi", "dispatch"];
const BRANCH_TYPES: BranchType[] = ["half", "salary", "ads"];
const LEDGER_TYPES: LedgerType[] = ["collected", "purchase", "sent", "ads"];
const BAN_FOREVER = "876000h"; // 100 عام

// الصفحة اللي نرجعو ليها بعد العملية (المؤكدات، السويفي، ولا الإعدادات)
function backTo(form: FormData, fallback: string) {
  const b = str(form, "back");
  return /^\/manager(\/[a-z]+)?$/.test(b) ? b : fallback;
}

// ---------- الحسابات ----------
// المدير يحط كلمة السر. تمشي لـSupabase Auth اللي يخزنها hash، ما تتسجلش ما تتخزنش عندنا.
export async function createUser(form: FormData) {
  await requireRole("manager");
  const P = backTo(form, "/manager/settings");
  const name = str(form, "name"), email = str(form, "email").toLowerCase(), phone = str(form, "phone");
  const role = str(form, "role") as Role, joined = str(form, "joined_at") || new Date().toISOString().slice(0, 10);
  const branchId = str(form, "branch_id") || null, password = String(form.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) back(P, "err", "دخل الاسم وإيميل صحيح");
  if (!ROLES.includes(role)) back(P, "err", "اختار الدور");
  if (password.length < 8) back(P, "err", "كلمة السر لازم 8 حروف ولا أكثر");
  const needsBranch = role === "branch" || role === "suivi";
  if (needsBranch && !branchId) back(P, "err", "الفرع والسويفي لازم تختارلهم الفرع");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) back(P, "err", /already|exists/i.test(error?.message ?? "") ? "هذا الإيميل عندو حساب" : "ما قدرناش نخلقو الحساب");
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id, name, email, phone: phone || null, joined_at: joined, role, branch_id: needsBranch ? branchId : null,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id); // ما نخليوش حساب بلا دور
    back(P, "err", pErr.code === "23505" ? "هذا الفرع عندو سويفي من قبل" : "ما قدرناش نخلقو الحساب");
  }
  revalidatePath("/manager", "layout");
  back(P, "ok", `تخلق الحساب تاع ${name}. عطيه الإيميل وكلمة السر بيدك.`);
}

export async function setLocked(form: FormData) {
  const me = await requireRole("manager");
  const P = backTo(form, "/manager/settings");
  const id = str(form, "id"), lock = str(form, "lock") === "1";
  if (id === me.id) back(P, "err", "ما تقدرش تبلوكي روحك");
  const sb = await supabaseServer();
  const { error } = await sb.from("profiles").update({ locked: lock }).eq("id", id);
  if (error) back(P, "err", dbError(error));
  // نوقفو الدخول تاني من Supabase Auth
  await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: lock ? BAN_FOREVER : "none" });
  revalidatePath("/manager", "layout");
  back(P, "ok", lock ? "الحساب تبلوكا" : "الحساب رجع يخدم");
}

export async function resetPassword(form: FormData) {
  await requireRole("manager");
  const P = backTo(form, "/manager/settings");
  const id = str(form, "id"), password = String(form.get("password") ?? "");
  if (password.length < 8) back(P, "err", "كلمة السر لازم 8 حروف ولا أكثر");
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
  if (error) back(P, "err", "ما قدرناش نبدلو كلمة السر");
  back(P, "ok", "تبدلت كلمة السر");
}

// ---------- الفروع ----------
export async function saveBranch(form: FormData) {
  await requireRole("manager");
  const P = "/manager/branches";
  const id = str(form, "id"), name = str(form, "name"), type = str(form, "type") as BranchType;
  if (!name) back(P, "err", "دخل اسم الفرع");
  if (!BRANCH_TYPES.includes(type)) back(P, "err", "اختار نوع الفرع");
  const row = { name, type, delivery_company: str(form, "delivery_company") || null, delivery_account: str(form, "delivery_account") || null };
  const sb = await supabaseServer();
  const { error } = id ? await sb.from("branches").update(row).eq("id", id) : await sb.from("branches").insert(row);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", id ? "تحفظ الفرع" : "تزاد الفرع");
}

// ---------- المنتجات ----------
export async function createProduct(form: FormData) {
  await requireRole("manager");
  const P = "/manager/products";
  const name = str(form, "name"), branch_id = str(form, "branch_id"), price = int(form, "price"), min_qty = int(form, "min_qty");
  if (!name || !branch_id) back(P, "err", "دخل اسم المنتج واختار الفرع");
  if (!(price >= 0) || !(min_qty >= 0)) back(P, "err", "السعر والحد الأدنى لازم أرقام");
  const sb = await supabaseServer();
  const { error } = await sb.from("products").insert({ name, branch_id, price, min_qty });
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تزاد المنتج. زيدلو الألوان والمقاسات بالستوك.");
}

export async function saveProduct(form: FormData) {
  await requireRole("manager");
  const P = "/manager/products";
  const id = str(form, "id"), price = int(form, "price"), min_qty = int(form, "min_qty");
  if (!(price >= 0) || !(min_qty >= 0)) back(P, "err", "السعر والحد الأدنى لازم أرقام");
  if (price === 0) back(P, "err", "دخل السعر");
  const sb = await supabaseServer();
  const { error } = await sb.from("products")
    .update({ name: str(form, "name"), branch_id: str(form, "branch_id"), price, min_qty, active: form.get("active") === "on", pending: false }).eq("id", id);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تحفظ المنتج");
}

export async function managerAddStock(form: FormData) {
  await requireRole("manager");
  const P = "/manager/products";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_stock", {
    p_branch: str(form, "branch_id"), p_product_name: str(form, "product_name"),
    p_color: str(form, "color"), p_size: str(form, "size"), p_qty: int(form, "qty"),
  });
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تزادت الكمية للستوك");
}

export async function correctStock(form: FormData) {
  await requireRole("manager");
  const P = "/manager/products";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("correct_stock", { p_variant: str(form, "variant_id"), p_delta: int(form, "delta"), p_note: str(form, "note") });
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تصحح الستوك");
}

// ---------- الدفتر ----------
export async function addLedger(form: FormData) {
  await requireRole("manager");
  const P = "/manager/branches";
  const type = str(form, "type") as LedgerType, amount = int(form, "amount");
  if (!LEDGER_TYPES.includes(type)) back(P, "err", "اختار نوع الحركة");
  if (!(amount > 0)) back(P, "err", "المبلغ لازم يكون أكبر من 0");
  const sb = await supabaseServer();
  const { error } = await sb.from("ledger_entries").insert({
    branch_id: str(form, "branch_id"), type, amount, note: str(form, "note") || null,
    entry_day: str(form, "entry_day") || new Date().toISOString().slice(0, 10),
  });
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تسجلت الحركة");
}

// الغلط ما يتمسحش: نديرو حركة معاكسة بنفس المبلغ بالسالب
export async function reverseLedger(form: FormData) {
  await requireRole("manager");
  const P = "/manager/branches";
  const sb = await supabaseServer();
  const id = int(form, "id");
  const { data: e } = await sb.from("ledger_entries").select("*").eq("id", id).maybeSingle();
  if (!e || e.amount < 0) back(P, "err", "الحركة ما كانتش");
  const { count } = await sb.from("ledger_entries").select("id", { count: "exact", head: true }).eq("reverses", id);
  if (count) back(P, "err", "هذي الحركة تلغات من قبل");
  const { error } = await sb.from("ledger_entries").insert({
    branch_id: e.branch_id, type: e.type, amount: -e.amount, reverses: id, note: `إلغاء: ${e.note ?? ""}`.trim(),
  });
  if (error) back(P, "err", dbError(error));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تلغات الحركة");
}

// ---------- شركات التوصيل ----------
// المفتاح يروح مباشرة لـVault (مشفر). ما يتسجلش، ما يرجعش للمتصفح، والصفحة تبين غير آخر 4 حروف.
export async function saveDelivery(form: FormData) {
  await requireRole("manager");
  const P = "/manager/delivery", id = str(form, "id");
  const company = str(form, "delivery_company") || null, account = str(form, "delivery_account") || null;
  const sb = await supabaseServer();
  const { error } = await sb.from("branches").update({ delivery_company: company, delivery_account: account }).eq("id", id);
  if (error) back(P, "err", dbError(error));
  const { error: kErr } = await sb.rpc("set_delivery_key", {
    p_branch: id, p_url: str(form, "api_url"), p_key: String(form.get("api_key") ?? ""),
  });
  if (kErr) back(P, "err", dbError(kErr));
  revalidatePath("/manager", "layout");
  back(P, "ok", "تحفظت شركة التوصيل.");
}

export async function clearDeliveryKey(form: FormData) {
  await requireRole("manager");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("clear_delivery_key", { p_branch: str(form, "id") });
  if (error) back("/manager/delivery", "err", dbError(error));
  revalidatePath("/manager", "layout");
  back("/manager/delivery", "ok", "تمسح المفتاح.");
}
