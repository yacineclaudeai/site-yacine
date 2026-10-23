// كل دقيقة: يقرا الشيتات المفعلة اللي فات الوقت تاعهم ويدخل الطلبات الجديدة.
import { createClient } from "@supabase/supabase-js";
import { syncDue } from "../../lib/sheets/core";

// الرابط عمومي. متغيرات [build.environment] ما توصلش للـfunctions، لهذا كاين احتياط.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kbutnnblkbbwwpyttfkm.supabase.co";

export default async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return new Response("no service key", { status: 500 });
  const admin = createClient(URL, key, { auth: { persistSession: false } });
  const res = await syncDue(admin);
  return Response.json({ synced: res.length });
};

export const config = { schedule: "* * * * *" };
