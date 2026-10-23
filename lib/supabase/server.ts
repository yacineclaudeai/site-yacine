import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// عميل Supabase باسم المستعمل اللي داخل: كل قراءة وكتابة تمر بـRLS.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

// لازم تتكتب كاملة (process.env.NEXT_PUBLIC_...) باش Next.js يحطها في الكود وقت الـbuild.
// process.env[name] ما يخدمش في Netlify، الـbuild variables ما يوصلوش للسيرفر.
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function required(name: string, v: string | undefined): string {
  if (!v) throw new Error(`المتغير ${name} ناقص في إعدادات السيرفر`);
  return v;
}
