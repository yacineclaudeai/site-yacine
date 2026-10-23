import Flash from "@/components/Flash";
import { CreateUserForm, LockButton } from "@/components/Accounts";
import { assignProduct } from "@/app/actions/orders";
import { loadBranches, loadProducts, loadProfiles, payCycle } from "@/lib/data";
import { confirmedCounts, PAY_PER_CONFIRM } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Confirmers({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [list, branches, products, { data: assign }] = await Promise.all([
    loadProfiles("confirmer"), loadBranches(), loadProducts(),
    sb.from("product_confirmers").select("product_id, confirmer_id"),
  ]);
  const owner = new Map((assign ?? []).map((a) => [a.product_id as string, a.confirmer_id as string]));
  const counts = await confirmedCounts(list);
  const orphan = products.filter((p) => !p.pending && !owner.has(p.id));
  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>زيد مؤكدة <span className="o-meta">(عندك {list.length}، وما كاين حد)</span></h3>
        <CreateUserForm back="/manager/confirmers" role="confirmer" branches={branches} label="زيد مؤكدة" />
        <div className="note" style={{ marginTop: 10 }}>انت تختار كلمة السر وتعطيهالها بيدك. تتخزن مشفرة، وحتى واحد ما يقدر يشوفها من بعد. دير كلمة سر مختلفة لكل وحدة.</div>
      </section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>توزيع المنتجات على المؤكدات</h3>
        <p className="sub">كل منتج تختارلو مؤكدة، والطلبيات تاعو تروحلها. منتج بلا مؤكدة، الطلبيات تاعو تبقى ما يشوفها حتى واحد.</p>
        {!!orphan.length && <div className="note" style={{ marginBottom: 10, background: "var(--warn-bg)", color: "var(--warn)" }}>{orphan.length} منتج بلا مؤكدة: {orphan.map((p) => p.name).join("، ")}.</div>}
        <div className="scroll"><table>
          <thead><tr><th>المنتج</th><th>المؤكدة</th></tr></thead>
          <tbody>{products.filter((p) => !p.pending).map((p) => (
            <tr key={p.id}><td>{p.name}</td><td>
              <form action={assignProduct} className="o-row">
                <input type="hidden" name="product_id" value={p.id} />
                <select name="confirmer_id" defaultValue={owner.get(p.id) ?? ""} aria-label="المؤكدة">
                  <option value="">بلا مؤكدة</option>
                  {list.filter((c) => !c.locked).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn sm" type="submit">حفظ</button>
              </form>
            </td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <div className="panel scroll">
        <table>
          <thead><tr><th>المؤكدة</th><th>الإيميل</th><th>الهاتف</th><th>تاريخ الدخول</th><th>الدورة الحالية</th><th>طلبيات مؤكدة</th><th>المستحق ({PAY_PER_CONFIRM} دج للطلبية)</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.length ? list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td className="num">{c.email}</td><td className="num">{c.phone ?? "-"}</td><td className="num">{c.joined_at}</td>
                <td className="num">{payCycle(c.joined_at)}</td><td className="num">{counts.get(c.id) ?? 0}</td><td className="num">{((counts.get(c.id) ?? 0) * PAY_PER_CONFIRM).toLocaleString("en-US")} دج</td>
                <td><LockButton u={c} back="/manager/confirmers" /></td>
              </tr>
            )) : <tr><td colSpan={8} className="empty">ما زال ما زدت حتى مؤكدة.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 10 }}>التأكيدات تتحسب من لحظة التأكيد، وتتشطب إذا الطلبية تلغات في فترة الانتظار.</p>
    </>
  );
}
