"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FIELDS, fetchRows, guessMapping, SheetError, syncSource, type Source } from "@/lib/sheets/core";
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
  const sync = int(f, "sync_minutes");
  const sb = await supabaseServer();
  const { error } = await sb.from("sheet_sources").update({
    name: str(f, "name") || "شيت", kind: str(f, "kind") === "abandoned" ? "abandoned" : "normal",
    url: url || null, columns, sync_minutes: sync >= 1 && sync <= 1440 ? sync : 5, active: f.get("active") === "on",
    ...(int(f, "start_row") >= 2 ? { start_row: int(f, "start_row") } : {}),
  }).eq("id", int(f, "id"));
  await done(error, "تحفظ الشيت.");
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
  const admin = supabaseAdmin();
  const { data } = await admin.from("sheet_sources").select("*").eq("id", id).maybeSingle();
  if (!data) back(P, "err", "الشيت ما كانش");
  return { admin, s: data as Source };
}

// يقرا أسماء الأعمدة و3 سطور مثال، ويخمن التطابق
export async function readColumns(f: FormData) {
  await requireRole("manager");
  const { admin, s } = await source(int(f, "id"));
  const typed = str(f, "url");
  if (typed && typed !== s.url) {
    if (!SHEET_URL.test(typed)) back(P, "err", "رابط الشيت لازم يبدا بـ https://docs.google.com/spreadsheets/");
    await admin.from("sheet_sources").update({ url: typed }).eq("id", s.id);
    s.url = typed;
  }
  if (!s.url) back(P, "err", "حط رابط الشيت قبل");
  let rows: string[][] = [];
  try { rows = await fetchRows(s.url!); } catch (e) { back(P, "err", e instanceof SheetError ? e.message : "ما قدرتش نقرا الشيت"); }
  const headers = (rows[0] ?? []).map((h) => h.trim()).filter(Boolean);
  if (!headers.length) back(P, "err", "السطر الأول تاع الشيت فارغ. لازم يكون فيه أسماء الأعمدة.");
  const patch: Record<string, unknown> = { headers, preview: rows.slice(1, 4), columns: guessMapping(headers, s.columns ?? {}) };
  if (f.get("skip_old") === "on") patch.start_row = rows.length + 1;
  const { error } = await admin.from("sheet_sources").update(patch).eq("id", s.id);
  await done(error, `قريت ${headers.length} عمود و${Math.max(0, rows.length - 1)} سطر. شوف التطابق واحفظ.`);
}

export async function syncNow(f: FormData) {
  await requireRole("manager");
  const { admin, s } = await source(int(f, "id"));
  const r = await syncSource(admin, s);
  revalidatePath("/", "layout");
  if ("message" in r && r.message) back(P, "err", r.message);
  back(P, "ok", `تزامن: ${r.imported} طلبية جديدة` + (r.errors ? `، ${r.errors} سطر فيه مشكل (شوف تحت)` : "") + ".");
}
