"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, homeFor } from "@/lib/auth";
import { str } from "./util";

export async function signIn(form: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: str(form, "email"), password: String(form.get("password") ?? "") });
  if (error) {
    // نسجلو السبب بلا كلمة السر، ونعطيو رسالة واضحة
    console.error("sign-in failed:", error.code ?? error.status, error.message);
    const msg = error.code === "email_not_confirmed"
      ? "الإيميل مازال ما تأكدش. في Supabase اخلق المستعمل من جديد وعلم على Auto Confirm User."
      : error.code === "user_banned"
        ? "الحساب هذا مبلوكي. كلم المدير."
        : error.code === "invalid_credentials"
          ? "الإيميل ولا كلمة السر غالطين."
          : `ما قدرناش ندخلو (${error.code ?? error.status ?? "?"}).`;
    redirect(`/login?err=${encodeURIComponent(msg)}`);
  }
  const me = await getMe();
  if (!me || me.locked) {
    await sb.auth.signOut();
    redirect(`/login?err=${encodeURIComponent("الحساب هذا مبلوكي ولا ما عندوش دور. كلم المدير.")}`);
  }
  redirect(homeFor(me.role));
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
