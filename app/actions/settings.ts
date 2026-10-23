"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FIELDS, fetchRows, guessMapping, matchProduct, prodKey, SheetError, sheetProducts, syncSource, table, testSource,
  type Source } from "@/lib/sheets/core";
import { back, dbError, int, str } from "./util";

const P = "/manager/settings";
const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\//;

async function done(error: { message?: string; code?: string } | null, ok: string): Promise<never> {
  if (error) back(P, "err", dbError(error));
  revalidatePath("/", "layout");
  back(P, "ok", ok);
}

export async function setOrderSource(f: FormData) {
  await requireRole("manager");
  const v = str(f, "order_source") === "direct" ? "direct" : "sheet";
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").update({ order_source: v }).eq("id", true);
  await done(error, "تحفظ مصدر الطلبات.");
}

export async function saveWait(f: FormData) {
  await requireRole("manager");
  const m = int(f, "wait_minutes");
  if (!(m >= 0 && m <= 1440)) back(P, "err", "الوقت لازم يكون من 0 لـ1440 دقيقة");
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").update({ wait_minutes: m }).eq("id", true);
  await done(error, "تحفظ وقت الانتظار. يخدم على الطلبيات اللي تتأكد من ذركا.");
}

export async function saveLimits(f: FormData) {
  await requireRole("manager");
  const row = {
    low_qty: int(f, "low_qty"), big_qty: int(f, "big_qty"), return_pct: int(f, "return_pct"),
    min_sample: int(f, "min_sample"), ret_low: int(f, "ret_low"), ret_high: int(f, "ret_high"),
  };
  if (Object.values(row).some((n) => !(n >= 0))) back(P, "err", "كل الخانات لازم أرقام");
  if (row.low_qty > row.big_qty) back(P, "err", "الكمية القليلة لازم تكون أصغر من الكبيرة");
  if (row.ret_low > row.ret_high) back(P, "err", "\"من\" لازم تكون أصغر من \"إلى\"");
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").update(row).eq("id", true);
  await done(error, "تحفظو الحدود والنسب.");
}

export async function saveSource(f: FormData) {
  await requireRole("manager");
  const url = str(f, "url");
  if (url && !SHEET_URL.test(url)) back(P, "err", "رابط الشيت لازم يبدا بـ https://docs.google.com/spreadsheets/");
  const columns: Record<string, string> = {};
  for (const k of FIELDS) { const v = str(f, `col_${k}`); if (v) columns[k] = v; }
  // ربط المنتجات: prod_text_i (النص) + prod_id_i (منتج الموقع)
  const product_map: Record<string, string> = {};
  for (let i = 0; f.has(`prod_text_${i}`); i++) {
    const id = str(f, `prod_id_${i}`);
    if (id) product_map[prodKey(str(f, `prod_text_${i}`))] = id;
  }
  const sync = int(f, "sync_minutes");
  const sb = await supabaseServer();
  const { error } = await sb.from("sheet_sources").update({
    name: str(f, "name") || "شيت", kind: str(f, "kind") === "abandoned" ? "abandoned" : "normal",
    url: url || null, columns, ...(f.has("prod_text_0") ? { product_map } : {}), sync_minutes: sync >= 1 && sync <= 1440 ? sync : 5, active: f.get("active") === "on",
    ...(int(f, "start_row") >= 2 ? { start_row: int(f, "start_row") } : {}),
  }).eq("id", int(f, "id"));
  // الطلبات اللي دخلو بلا منتج تتربط ذركا
  let linked = 0;
  if (!error && Object.keys(product_map).length) {
    const { data } = await supabaseAdmin().rpc("apply_product_map", { p_source: int(f, "id"), p_map: product_map });
    linked = (data as number) ?? 0;
  }
  await done(error, "تحفظ الشيت." + (linked ? ` ${linked} طلبية تربطت بالمنتج تاعها.` : ""));
}

export async function addSource() {
  await requireRole("manager");
  const sb = await supabaseServer();
  const { error } = await sb.from("sheet_sources").insert({ name: "شيت جديد", kind: "normal", active: false });
  await done(error, "تزاد سطر جديد. عمرو واحفظ.");
}

export async function deleteSource(f: FormData) {
  await requireRole("manager");
  const sb = await supabaseServer();
  const { error } = await sb.from("sheet_sources").delete().eq("id", int(f, "id"));
  await done(error, "تحذف الشيت.");
}

// ---------- ربط الشيت ----------
async function source(id: number) {
  let admin;
  try { admin = supabaseAdmin(); } catch { back(P, "err", "المفتاح السري SUPABASE_SERVICE_ROLE_KEY ناقص في Netlify (Environment variables). بلا بيه الموقع ما يقدرش يقرا الشيت."); }
  const { data, error } = await admin!.from("sheet_sources").select("*").eq("id", id).maybeSingle();
  if (error) back(P, "err", dbError(error));
  if (!data) back(P, "err", "الشيت ما كانش");
  return { admin: admin!, s: data as Source };
}

async function saveTypedUrl(f: FormData, admin: ReturnType<typeof supabaseAdmin>, s: Source) {
  const typed = str(f, "url");
  if (typed && typed !== s.url) {
    if (!SHEET_URL.test(typed)) back(P, "err", "رابط الشيت لازم يبدا بـ https://docs.google.com/spreadsheets/");
    const { error } = await admin.from("sheet_sources").update({ url: typed }).eq("id", s.id);
    if (error) back(P, "err", dbError(error));
    s.url = typed;
  }
  if (!s.url) back(P, "err", "حط رابط الشيت قبل");
}

// يقرا أسماء الأعمدة و3 سطور مثال، يخمن التطابق، ويجمع أسماء المنتجات اللي في الشيت
export async function readColumns(f: FormData) {
  await requireRole("manager");
  const { admin, s } = await source(int(f, "id"));
  await saveTypedUrl(f, admin, s);
  let rows: string[][] = [];
  try { rows = await fetchRows(s.url!); } catch (e) { back(P, "err", e instanceof SheetError ? e.message : `ما قدرتش نقرا الشيت: ${String(e).slice(0, 200)}`); }
  const { headerRow, headers } = table(rows);
  if (!rows.length || rows[headerRow - 1].every((c) => !String(c ?? "").trim())) back(P, "err", "الشيت فارغ، ولا الورقة اللي في الرابط ماشي ورقة الطلبات.");
  const columns = guessMapping(headers, s.columns ?? {});
  const start = f.get("skip_old") === "on" ? rows.length + 1 : Math.max(s.start_row, headerRow + 1);
  const texts = sheetProducts(rows, columns);
  const { data: products } = await admin.from("products").select("id, name").eq("active", true).eq("pending", false);
  const product_map = { ...(s.product_map ?? {}) };
  for (const t of texts) { // تخمين أولي، المدير يصحح
    const k = prodKey(t.text), m = matchProduct(t.text, products ?? []);
    if (!product_map[k] && m) product_map[k] = m.id;
  }
  const { error } = await admin.from("sheet_sources").update({
    headers, preview: rows.slice(headerRow, headerRow + 3), columns, start_row: start, product_texts: texts, product_map,
  }).eq("id", s.id);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/", "layout");
  back(P, "ok", `قريت الشيت: ${headers.length} عمود و${Math.max(0, rows.length - headerRow)} سطر` +
    (headerRow > 1 ? ` (العناوين في السطر ${headerRow})` : "") + `. شوف تطابق الأعمدة وربط المنتجات، واضغط حفظ.`);
}

export async function testConnection(f: FormData) {
  await requireRole("manager");
  const { admin, s } = await source(int(f, "id"));
  await saveTypedUrl(f, admin, s);
  const r = await testSource(admin, s);
  const { error } = await admin.from("sheet_sources").update({
    last_test: { at: new Date().toISOString(), ok: r.ok, lines: r.lines }, ...(r.errors.length ? { last_errors: r.errors.slice(0, 50) } : {}),
  }).eq("id", s.id);
  if (error) back(P, "err", dbError(error));
  revalidatePath("/", "layout");
  back(P, r.ok ? "ok" : "err", r.ok ? "الموقع دخل للشيت. شوف النتيجة تحت الرابط." : r.lines[0].replace(/^✗ /, ""));
}

export async function syncNow(f: FormData) {
  await requireRole("manager");
  const { admin, s } = await source(int(f, "id"));
  const r = await syncSource(admin, s);
  revalidatePath("/", "layout");
  if ("message" in r && r.message) back(P, "err", r.message);
  back(P, "ok", `تزامن: ${r.imported} طلبية جديدة` + (r.errors ? `، ${r.errors} سطر ما دخلش (شوف السبب تحت)` : "") + ".");
}
