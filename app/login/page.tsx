import Flash from "@/components/Flash";
import { signIn } from "@/app/actions/auth";

export default function Login({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  return (
    <main>
      <form action={signIn} className="panel login">
        <h2>دخول</h2>
        <p className="sub">الحساب يعطيهولك المدير.</p>
        <Flash searchParams={searchParams} />
        <label className="f">الإيميل<input type="email" name="email" required autoComplete="email" dir="ltr" /></label>
        <label className="f">كلمة السر<input type="password" name="password" required autoComplete="current-password" dir="ltr" /></label>
        <button className="btn pri" type="submit">ادخل</button>
      </form>
    </main>
  );
}
