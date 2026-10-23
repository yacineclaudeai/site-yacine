import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./server";

// عميل بالمفتاح السري: يتجاوز RLS. يستعمل غير بعد ما نتأكدو بلي اللي طلب هو المدير.
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ناقص في Netlify > Environment variables");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
