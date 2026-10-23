import Flash from "@/components/Flash";
import { blacklistAdd, blacklistRemove } from "@/app/actions/orders";
import { loadProfiles } from "@/lib/data";
import { FOLLOW } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;
type Row = { phone_key: string; phone: string; name: string | null; reason: string; added_by: string | null; created_at: string };

export default async function Blacklist({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [{ data }, people] = await Promise.all([sb.from("blacklist").select("*").order("created_at", { ascending: false }), loadProfiles()]);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const list = (data ?? []) as Row[];
  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>زيد رقم في ليست نوار</h3>
        <form action={blacklistAdd} className="o-row">
          <label className="f">الهاتف<input type="text" name="phone" dir="ltr" inputMode="tel" required /></label>
          <label className="f">الاسم (اختياري)<input type="text" name="name" /></label>
          <label className="f">السبب<select name="reason">{FOLLOW.map((f) => <option key={f}>{f}</option>)}</select></label>
          <button className="btn pri" type="submit">زيد</button>
        </form>
        <div className="note" style={{ marginTop: 10 }}>أي رقم هنا ما يوصلش لا للمؤكدات ولا للسويفي، حتى الطلبيات الجديدة تاعو. الحذف ليك وحدك. القائمة تتحفظ دايما.</div>
      </section>
      <div className="panel scroll">
        <table>
          <thead><tr><th>الهاتف</th><th>الاسم</th><th>السبب</th><th>التاريخ</th><th>أضافو</th><th></th></tr></thead>
          <tbody>
            {list.length ? list.map((b) => (
              <tr key={b.phone_key}>
                <td className="num" dir="ltr">{b.phone}</td><td>{b.name ?? "-"}</td><td>{b.reason}</td>
                <td className="num">{b.created_at.slice(0, 10)}</td><td>{b.added_by ? who.get(b.added_by) ?? "-" : "-"}</td>
                <td><form action={blacklistRemove}><input type="hidden" name="key" value={b.phone_key} /><button className="btn sm" type="submit">حذف</button></form></td>
              </tr>
            )) : <tr><td colSpan={6} className="empty">القائمة فارغة.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
