import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./server";

// عميل بالمفتاح السري: يتجاوز RLS. يستعمل غير بعد ما نتأكدو بلي اللي طلب هو المدير.
export function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
