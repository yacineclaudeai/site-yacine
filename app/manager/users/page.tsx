import Flash from "@/components/Flash";
import { createUser, resetPassword, setLocked } from "@/app/actions/manager";
import { supabaseServer } from "@/lib/supabase/server";
import { loadBranches } from "@/lib/data";
import { ROLE_LABEL, type Profile, type Role } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Users({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [{ data }, branches] = await Promise.all([sb.from("profiles").select("*").order("role").order("name"), loadBranches()]);
  const users = (data ?? []) as Profile[];
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h2>الحسابات</h2>
      <p className="sub">أنت وحدك تخلق الحسابات. كلمة السر تتخزن مشفرة، وحتى حد ما يقدر يشوفها من بعد.</p>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>زيد حساب</h3>
        <form action={createUser} className="o-row">
          <label className="f">الاسم<input type="text" name="name" required /></label>
          <label className="f">الإيميل<input type="email" name="email" required dir="ltr" /></label>
          <label className="f">الهاتف<input type="tel" name="phone" dir="ltr" /></label>
          <label className="f">تاريخ الدخول<input type="date" name="joined_at" defaultValue={today} /></label>
          <label className="f">الدور
            <select name="role" required defaultValue="">
              <option value="" disabled>— اختار —</option>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="f">الفرع (للفرع والسويفي)
            <select name="branch_id" defaultValue="">
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="f">كلمة السر (8 ولا أكثر)<input type="password" name="password" required minLength={8} autoComplete="new-password" dir="ltr" /></label>
          <button className="btn pri" type="submit">خلق الحساب</button>
        </form>
        <p className="o-meta" style={{ marginTop: 8 }}>نصيحة: دير كلمة سر مختلفة لكل واحد. إذا واحد خرج من الخدمة، بلوكيه برك وما تمسحوش، باش يبقى التاريخ تاعو.</p>
      </section>
      <div className="panel scroll">
        <table>
          <thead><tr><th>الاسم</th><th>الدور</th><th>الفرع</th><th>الإيميل</th><th>الهاتف</th><th>تاريخ الدخول</th><th>الحالة</th><th>كلمة سر جديدة</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.branch_id ? bname.get(u.branch_id) : "-"}</td>
                <td className="num">{u.email}</td>
                <td className="num">{u.phone ?? "-"}</td>
                <td className="num">{u.joined_at}</td>
                <td>
                  <form action={setLocked} className="o-row">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="lock" value={u.locked ? "0" : "1"} />
                    <span className={`chip ${u.locked ? "bad" : "ok"}`}>{u.locked ? "مبلوكي" : "يخدم"}</span>
                    <button className="btn sm" type="submit">{u.locked ? "رجعو" : "بلوكي"}</button>
                  </form>
                </td>
                <td>
                  <form action={resetPassword} className="o-row">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="password" name="password" minLength={8} required autoComplete="new-password" dir="ltr" aria-label="كلمة سر جديدة" style={{ width: 130 }} />
                    <button className="btn sm" type="submit">بدل</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
