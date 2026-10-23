import "server-only";
import { supabaseServer } from "./supabase/server";
import type { Branch, LedgerEntry, Product, Profile } from "./types";

// كل القراءات تمر بـRLS: الفرع يرجعلو غير تاعو.
export async function loadBranches(): Promise<Branch[]> {
  const sb = await supabaseServer();
  const { data } = await sb.from("branches").select("*").order("name");
  return (data ?? []) as Branch[];
}

export async function loadProducts(branchId?: string): Promise<Product[]> {
  const sb = await supabaseServer();
  let q = sb.from("products").select("*, variants(*)").order("name");
  if (branchId) q = q.eq("branch_id", branchId);
  const { data } = await q;
  const list = (data ?? []) as Product[];
  list.forEach((p) => p.variants.sort((a, b) => (a.color + a.size).localeCompare(b.color + b.size, "ar")));
  return list;
}

export async function loadLedger(branchId?: string): Promise<LedgerEntry[]> {
  const sb = await supabaseServer();
  let q = sb.from("ledger_entries").select("*").order("entry_day", { ascending: false }).order("id", { ascending: false });
  if (branchId) q = q.eq("branch_id", branchId);
  const { data } = await q;
  return (data ?? []) as LedgerEntry[];
}

export async function loadProfiles(role?: string): Promise<Profile[]> {
  const sb = await supabaseServer();
  let q = sb.from("profiles").select("*").order("role").order("name");
  if (role) q = q.eq("role", role);
  const { data } = await q;
  return (data ?? []) as Profile[];
}

// الدورة الشهرية تبدا من نهار الدخول (كيما النموذج)
export function payCycle(joined: string) {
  const j = new Date(joined + "T00:00:00"), t = new Date();
  let st = new Date(t.getFullYear(), t.getMonth(), j.getDate());
  if (st > t) st = new Date(t.getFullYear(), t.getMonth() - 1, j.getDate());
  const en = new Date(st.getFullYear(), st.getMonth() + 1, j.getDate() - 1);
  const f = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `${f(st)} ← ${f(en)}`;
}
