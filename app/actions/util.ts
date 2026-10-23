import "server-only";
import { redirect } from "next/navigation";

export function back(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const int = (f: FormData, k: string) => {
  const n = Number(f.get(k));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

// رسائل الغلط اللي تجي من قاعدة البيانات مكتوبة بالدارجة، والباقي نخبيه.
export function dbError(e: { message?: string; code?: string } | null): string {
  if (!e) return "";
  if (e.code === "42501" || /permission|row-level/i.test(e.message ?? "")) return "ما عندكش الصلاحية";
  if (e.code === "23505") return "هذا موجود من قبل";
  // الكود جديد وقاعدة البيانات قديمة: ملف SQL ما تلصقش
  if (e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST202" || /column .* does not exist|schema cache/i.test(e.message ?? "")) {
    return "قاعدة البيانات ناقصة: الصق آخر ملف SQL اللي عطيتهولك في Supabase (SQL Editor) وعاود جرب.";
  }
  if (e.message && /[؀-ۿ]/.test(e.message)) return e.message;
  return "صرا مشكل، عاود جرب";
}
