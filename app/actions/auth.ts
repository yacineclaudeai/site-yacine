"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, homeFor } from "@/lib/auth";
import { str } from "./util";

export async function signIn(form: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: str(form, "email"), password: String(form.get("password") ?? "") });
  if (error) redirect(`/login?err=${encodeURIComponent("الإيميل ولا كلمة السر غالطين، ولا الحساب مبلوكي")}`);
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
