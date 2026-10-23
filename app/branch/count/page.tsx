import Flash from "@/components/Flash";
import { addStock, submitCount } from "@/app/actions/branch";
import { requireRole } from "@/lib/auth";
import { loadProducts } from "@/lib/data";
import { shortDate, variantLabel } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function BranchStock({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("branch");
  const products = (await loadProducts(me.branch_id!)).filter((p) => p.active);

  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>وصلتك سلعة؟</h3>
        <p className="sub" style={{ margin: "0 0 8px" }}>اكتب اسم المنتج. إذا كان عندك، تتزاد الكمية للون والمقاس. وإذا منتج جديد، يتسجل وينتظر المدير يحط السعر.</p>
        <form action={addStock} className="o-row">
          <label className="f" style={{ minWidth: 200 }}>اسم المنتج<input type="text" name="product_name" list="my-products" required placeholder="مثلا: بيجامة قطيفة" /></label>
          <datalist id="my-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <label className="f">اللون<input type="text" name="color" required placeholder="أحمر" /></label>
          <label className="f">المقاس<input type="text" name="size" required placeholder="L" /></label>
          <label className="f">الكمية<input type="number" name="qty" min={1} defaultValue={1} required /></label>
          <button className="btn pri" type="submit">زيد للستوك</button>
        </form>
      </section>
      {!!products.length && <p className="sub">كل لون ومقاس سطر. بدل الكمية وحفظ، ولا زيد لون ومقاس جديد من "وصلتك سلعة؟".</p>}
      {products.length ? products.map((p) => {
        const last = p.variants.map((v) => v.counted_at).filter(Boolean).sort().at(-1) ?? null;
        return (
          <section className="panel" key={p.id} style={{ marginBottom: 12 }}>
            <h3>{p.name} {p.pending && <span className="chip warn">ينتظر المدير</span>} <span className="o-meta">آخر عد: {shortDate(last)}</span></h3>
            {p.variants.length ? (
              <form action={submitCount}>
                <input type="hidden" name="product_id" value={p.id} />
                <div className="o-row">
                  {p.variants.map((v) => (
                    <label className="f" key={v.id}>{variantLabel(v)}
                      <input type="number" name={`c_${v.id}`} min={0} defaultValue={v.stock} required
                        style={v.stock === 0 ? { borderColor: "var(--bad)" } : v.stock <= p.min_qty ? { borderColor: "var(--warn)" } : undefined} />
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}><button className="btn pri" type="submit">حفظ العد</button></div>
              </form>
            ) : <p className="o-meta">ما كاين حتى لون ومقاس. زيدهم من "وصلتك سلعة؟".</p>}
          </section>
        );
      }) : <div className="empty">ما عندكش منتجات مربوطة.</div>}
    </>
  );
}
