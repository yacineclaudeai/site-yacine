import Flash from "@/components/Flash";
import { CreateUserForm, LockButton } from "@/components/Accounts";
import { loadBranches, loadProfiles } from "@/lib/data";
import { fmt } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;
const SUIVI_PAY = 15000;

export default async function Suivi({ searchParams }: { searchParams: Sp }) {
  const [list, branches] = await Promise.all([loadProfiles("suivi"), loadBranches()]);
  const br = new Map(branches.map((b) => [b.id, b]));
  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>زيد سويفي <span className="o-meta">(عندك {list.length})</span></h3>
        <CreateUserForm back="/manager/suivi" role="suivi" branches={branches} label="زيد سويفي" />
      </section>
      <div className="panel scroll">
        <table>
          <thead><tr><th>السويفي</th><th>الإيميل</th><th>الهاتف</th><th>تاريخ الدخول</th><th>الفرع وشركة التوصيل</th><th>الشهرية</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.length ? list.map((x) => {
              const b = x.branch_id ? br.get(x.branch_id) : undefined;
              return (
                <tr key={x.id}>
                  <td>{x.name}</td><td className="num">{x.email}</td><td className="num">{x.phone ?? "-"}</td><td className="num">{x.joined_at}</td>
                  <td>{b?.name}<div className="o-meta">{b?.delivery_company}</div></td><td className="num">{fmt(SUIVI_PAY)} دج</td>
                  <td><LockButton u={x} back="/manager/suivi" /></td>
                </tr>
              );
            }) : <tr><td colSpan={7} className="empty">ما زال ما زدت حتى سويفي.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="kv" style={{ marginTop: 12 }}><span>مجموع الشهريات</span><b className="num">{fmt(list.filter((x) => !x.locked).length * SUIVI_PAY)} دج</b></div>
      <p className="sub" style={{ marginTop: 8 }}>السويفي يتخلص شهرية ثابتة، ماشي بالطلبية. وكل سويفي يشوف غير كوليات شركة التوصيل تاع فرعو.</p>
    </>
  );
}
