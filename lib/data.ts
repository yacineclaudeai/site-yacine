import "server-only";
import { supabaseServer } from "./supabase/server";
import type { Branch, LedgerEntry, Product } from "./types";

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
