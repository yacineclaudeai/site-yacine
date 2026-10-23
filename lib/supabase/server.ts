import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// عميل Supabase باسم المستعمل اللي داخل: كل قراءة وكتابة تمر بـRLS.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // في Server Component ما نقدروش نكتبو الكوكيز، الـmiddleware يجددها.
        }
      },
    },
  });
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`المتغير ${name} ناقص في إعدادات السيرفر`);
  return v;
}
