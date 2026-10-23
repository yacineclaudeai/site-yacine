import VariantChips from "@/components/VariantChips";
import { supabaseServer } from "@/lib/supabase/server";
import { loadBranches, loadProducts } from "@/lib/data";

// الوضعية من الستوك برك. الحملة والرتور المتوقع يجيو مع الطلبيات.
function hint(n: number, min: number): [string, string, string] {
  if (n === 0) return ["خلص", "bad", "السلعة خلصت. وقف الحملة حتى تجيك سلعة ولا ترجع."];
  if (n <= min) return ["قليلة", "warn", "الكمية قليلة. قلل الميزانية ولا وقفها."];
  return ["كاينة", "ok", "فيها سلعة."];
}

export default async function Quantities() {
  const sb = await supabaseServer();
  const [branches, products, { data: returns }] = await Promise.all([
    loadBranches(), loadProducts(), sb.from("returns").select("variant_id, qty"),
  ]);
  const retBy = new Map<string, number>();
  (returns ?? []).forEach((r) => retBy.set(r.variant_id, (retBy.get(r.variant_id) ?? 0) + r.qty));
  const sum = (p: (typeof products)[number]) => p.variants.reduce((a, v) => a + v.stock, 0);
  const rets = (p: (typeof products)[number]) => p.variants.reduce((a, v) => a + (retBy.get(v.id) ?? 0), 0);
  const bname = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>
        هنا تشوف السلعة اللي بقات في كل فرع، باش تقرر واش تعاود تفتح الحملة ولا تزيد فيها. والقرار تاعك.
        الأعمدة "في التوصيل" و"المتوقع يرجع" يتعمرو كي تجي الطلبيات (المرحلة 2).
      </div>
      <div className="panel scroll">
        <table>
          <thead><tr><th>المنتج</th><th>الفرع</th><th>المتوفر الآن</th><th>في التوصيل</th><th>المتوقع يرجع</th><th>متاح بعد الرتور</th><th>رتور مسجل</th><th>الوضعية</th></tr></thead>
          <tbody>
            {products.length ? products.map((p) => {
              const n = sum(p), h = hint(n, p.min_qty);
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b><VariantChips variants={p.variants} min={p.min_qty} /></td>
                  <td>{bname.get(p.branch_id)}</td>
                  <td className="num">{n}</td>
                  <td className="num o-meta">-</td>
                  <td className="num o-meta">-</td>
                  <td className="big num">{n}</td>
                  <td className="num">{rets(p)}</td>
                  <td><span className={`chip ${h[1]}`}>{h[0]}</span><div className="o-meta">{h[2]}</div></td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="empty">ما كاين حتى منتج.</td></tr>}
          </tbody>
        </table>
      </div>
      <section className="panel" style={{ marginTop: 14 }}>
        <h3>مجموع كل فرع</h3>
        {branches.map((b) => (
          <div className="kv" key={b.id}><span>{b.name}</span><b className="num">{products.filter((p) => p.branch_id === b.id).reduce((a, p) => a + sum(p), 0)}</b></div>
        ))}
      </section>
    </>
  );
}
