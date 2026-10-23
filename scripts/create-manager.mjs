// يخلق أول حساب مدير (مرة وحدة). يقرا المفاتيح من البيئة، ما تكتبهمش هنا.
// الاستعمال:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-manager.mjs "ياسين" email@example.com
// كلمة السر تتسقسى في الترمينال وما تبانش.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const [name, email] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!name || !email || !url || !key) {
  console.error('الاستعمال: node scripts/create-manager.mjs "الاسم" email   (مع NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl._writeToOutput = (s) => { if (s.includes("كلمة السر")) rl.output.write(s); };
const password = await new Promise((r) => rl.question("كلمة السر (8 ولا أكثر): ", (a) => { rl.close(); console.log(); r(a); }));
if (password.length < 8) { console.error("كلمة السر قصيرة"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error("ما قدرناش نخلقو الحساب:", error.message); process.exit(1); }
const { error: pErr } = await sb.from("profiles").insert({ id: data.user.id, name, email, role: "manager" });
if (pErr) { await sb.auth.admin.deleteUser(data.user.id); console.error("ما قدرناش نخلقو البروفيل:", pErr.message); process.exit(1); }
console.log("تخلق حساب المدير:", email);
