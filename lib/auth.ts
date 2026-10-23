import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Profile, Role } from "./types";

export async function getMe(): Promise<Profile | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

// يرجع المستعمل إذا عندو واحد من الأدوار، وإلا يحولو. الحماية الحقيقية هي RLS، هذا للواجهة.
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const me = await getMe();
  if (!me || me.locked) redirect("/login");
  if (!roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}

export function homeFor(role: Role): string {
  switch (role) {
    case "manager": return "/manager";
    case "branch": return "/branch";
    default: return "/soon";
  }
}
